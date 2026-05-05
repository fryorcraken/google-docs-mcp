#!/usr/bin/env python3
"""
Sync a markdown file to a Google Docs tab.

This script:
1. Gets a fresh OAuth token
2. Deletes existing content from the tab
3. Inserts new markdown content
4. Applies heading styles
5. Removes # markers from headings
6. Replaces wiki-style links with plain text

Usage:
    python3 sync_to_tab.py --doc-id <doc-id> --tab-id <tab-id> --file <markdown-file>
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.parse

def get_access_token():
    """Get a fresh OAuth access token using the stored credentials."""
    token_path = os.path.expanduser("~/.config/google-docs-mcp/token.json")
    secrets_path = os.path.expanduser("~/.openclaw/secrets/google-docs-mcp.env")
    
    with open(token_path, 'r') as f:
        token = json.load(f)
    
    with open(secrets_path, 'r') as f:
        env_content = f.read()
    
    client_secret_match = re.search(r'GOOGLE_CLIENT_SECRET=(.+)', env_content)
    if not client_secret_match:
        raise ValueError("GOOGLE_CLIENT_SECRET not found in secrets file")
    client_secret = client_secret_match.group(1).strip()
    
    # Prepare token refresh request
    data = urllib.parse.urlencode({
        'client_id': token['client_id'],
        'client_secret': client_secret,
        'refresh_token': token['refresh_token'],
        'grant_type': 'refresh_token',
        'scope': 'https://www.googleapis.com/auth/documents'
    }).encode('utf-8')
    
    req = urllib.request.Request(
        'https://oauth2.googleapis.com/token',
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        method='POST'
    )
    
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        return result['access_token']


def api_request(access_token, doc_id, method='GET', endpoint='', data=None):
    """Make a request to the Google Docs API."""
    url = f"https://docs.googleapis.com/v1/documents/{doc_id}{endpoint}"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    
    if method == 'GET':
        url += '?includeTabsContent=true'
        req = urllib.request.Request(url, headers=headers, method=method)
    else:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers=headers,
            method=method
        )
    
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))


def get_tab_content(access_token, doc_id, tab_id):
    """Get the current content of a tab."""
    doc = api_request(access_token, doc_id)
    for tab in doc.get('tabs', []):
        if tab['tabProperties']['tabId'] == tab_id:
            return tab['documentTab']['body']['content']
    raise ValueError(f"Tab {tab_id} not found in document")


def delete_content(access_token, doc_id, tab_id, end_index):
    """Delete all content from a tab."""
    if end_index <= 1:
        return  # Nothing to delete
    
    data = {
        'requests': [{
            'deleteContentRange': {
                'range': {
                    'startIndex': 1,
                    'endIndex': end_index - 1,
                    'tabId': tab_id
                }
            }
        }]
    }
    api_request(access_token, doc_id, method='POST', endpoint=':batchUpdate', data=data)


def insert_text(access_token, doc_id, tab_id, text):
    """Insert text at the beginning of a tab."""
    data = {
        'requests': [{
            'insertText': {
                'location': {
                    'index': 1,
                    'tabId': tab_id
                },
                'text': text
            }
        }]
    }
    api_request(access_token, doc_id, method='POST', endpoint=':batchUpdate', data=data)


def apply_heading_styles(access_token, doc_id, tab_id, content):
    """Apply heading styles to paragraphs starting with # markers."""
    headings = []
    for item in content:
        if 'paragraph' not in item:
            continue
        elem = item['paragraph'].get('elements', [{}])[0]
        text = elem.get('textRun', {}).get('content', '')
        match = re.match(r'^(#{1,4}) (.+)\n?$', text)
        if match:
            hash_count = len(match.group(1))
            heading_type = f"HEADING_{hash_count}" if hash_count <= 3 else "NORMAL_TEXT"
            headings.append({
                'start': item['startIndex'],
                'end': item['endIndex'],
                'heading_type': heading_type,
                'hash_count': hash_count
            })
    
    # Apply heading styles in batches
    requests = []
    for h in headings:
        if h['heading_type'] != 'NORMAL_TEXT':
            requests.append({
                'updateParagraphStyle': {
                    'range': {
                        'startIndex': h['start'],
                        'endIndex': h['end'] - 1,
                        'tabId': tab_id
                    },
                    'paragraphStyle': {
                        'namedStyleType': h['heading_type']
                    },
                    'fields': 'namedStyleType'
                }
            })
    
    if requests:
        # Apply in batches of 25
        for i in range(0, len(requests), 25):
            batch = requests[i:i+25]
            api_request(access_token, doc_id, method='POST', endpoint=':batchUpdate', data={'requests': batch})
    
    return headings


def remove_hash_markers(access_token, doc_id, tab_id, headings):
    """Remove # markers from headings (process in reverse order)."""
    requests = []
    for h in reversed(headings):
        if h['hash_count'] <= 3:
            delete_len = h['hash_count'] + 1  # Include the space
            requests.append({
                'deleteContentRange': {
                    'range': {
                        'startIndex': h['start'],
                        'endIndex': h['start'] + delete_len,
                        'tabId': tab_id
                    }
                }
            })
    
    if requests:
        api_request(access_token, doc_id, method='POST', endpoint=':batchUpdate', data={'requests': requests})


def replace_wiki_links(access_token, doc_id, content):
    """Replace wiki-style links with plain text."""
    # Find all wiki-style links in the content
    wiki_links = set()
    for item in content:
        if 'paragraph' not in item:
            continue
        for elem in item['paragraph'].get('elements', []):
            text = elem.get('textRun', {}).get('content', '')
            matches = re.findall(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', text)
            for match in matches:
                target = match[0]
                display = match[1] if match[1] else target
                if '#' in target and not match[1]:
                    display = target.split('#')[1]
                original = f"[[{target}|{display}]]" if match[1] else f"[[{target}]]"
                wiki_links.add((original, display))
    
    # Replace each wiki link
    for original, display in wiki_links:
        data = {
            'requests': [{
                'replaceAllText': {
                    'containsText': {
                        'text': original,
                        'matchCase': True
                    },
                    'replaceText': display
                }
            }]
        }
        api_request(access_token, doc_id, method='POST', endpoint=':batchUpdate', data=data)


def remove_markdown_formatting(access_token, doc_id, content):
    """Remove remaining markdown formatting (**bold**, ---, etc.)."""
    # Find **bold** patterns
    bold_patterns = set()
    for item in content:
        if 'paragraph' not in item:
            continue
        for elem in item['paragraph'].get('elements', []):
            text = elem.get('textRun', {}).get('content', '')
            matches = re.findall(r'\*\*([^*]+)\*\*', text)
            bold_patterns.update(matches)
    
    # Replace **text** with text
    for text in bold_patterns:
        original = f"**{text}**"
        data = {
            'requests': [{
                'replaceAllText': {
                    'containsText': {
                        'text': original,
                        'matchCase': True
                    },
                    'replaceText': text
                }
            }]
        }
        api_request(access_token, doc_id, method='POST', endpoint=':batchUpdate', data=data)
    
    # Remove --- horizontal rules
    data = {
        'requests': [{
            'replaceAllText': {
                'containsText': {
                    'text': '---',
                    'matchCase': True
                },
                'replaceText': ''
            }
        }]
    }
    api_request(access_token, doc_id, method='POST', endpoint=':batchUpdate', data=data)


def main():
    parser = argparse.ArgumentParser(description='Sync a markdown file to a Google Docs tab')
    parser.add_argument('--doc-id', required=True, help='Google Doc ID')
    parser.add_argument('--tab-id', required=True, help='Tab ID (e.g., t.s2gcm054y3co)')
    parser.add_argument('--file', required=True, help='Markdown file to sync')
    parser.add_argument('--no-format', action='store_true', help='Skip markdown formatting cleanup')
    args = parser.parse_args()
    
    print(f"Syncing {args.file} to tab {args.tab_id}...")
    
    # Get access token
    access_token = get_access_token()
    print("✓ Got access token")
    
    # Read markdown file
    with open(args.file, 'r') as f:
        markdown_content = f.read()
    print(f"✓ Read {len(markdown_content)} characters from {args.file}")
    
    # Get current tab content and delete it
    content = get_tab_content(access_token, args.doc_id, args.tab_id)
    end_index = content[-1]['endIndex'] if content else 1
    delete_content(access_token, args.doc_id, args.tab_id, end_index)
    print(f"✓ Deleted existing content ({end_index} characters)")
    
    # Insert new content
    insert_text(access_token, args.doc_id, args.tab_id, markdown_content)
    print("✓ Inserted new content")
    
    # Get updated content for styling
    content = get_tab_content(access_token, args.doc_id, args.tab_id)
    
    # Apply heading styles
    headings = apply_heading_styles(access_token, args.doc_id, args.tab_id, content)
    print(f"✓ Applied heading styles to {len(headings)} headings")
    
    # Remove # markers
    remove_hash_markers(access_token, args.doc_id, args.tab_id, headings)
    print(f"✓ Removed # markers from {len(headings)} headings")
    
    if not args.no_format:
        # Get fresh content after # removal
        content = get_tab_content(access_token, args.doc_id, args.tab_id)
        
        # Replace wiki-style links
        replace_wiki_links(access_token, args.doc_id, content)
        print("✓ Replaced wiki-style links")
        
        # Remove markdown formatting
        content = get_tab_content(access_token, args.doc_id, args.tab_id)
        remove_markdown_formatting(access_token, args.doc_id, content)
        print("✓ Removed markdown formatting")
    
    print("Done!")


if __name__ == '__main__':
    main()
