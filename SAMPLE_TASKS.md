# 22 Powerful Tasks with the Ultimate Google Docs, Drive, Gmail & Calendar MCP Server

This document showcases practical examples of what you can accomplish with the enhanced Google Docs, Drive, Gmail & Calendar MCP Server. These examples demonstrate how AI assistants like Claude can perform sophisticated document formatting, structuring, markdown editing, file management, email, and calendar workflows through the MCP interface.

## Document Formatting & Structure Tasks

## 1. Create and Format a Document Header

```
Task: "Create a professional document header for my project proposal."

Steps:
1. Insert the title "Project Proposal: AI Integration Strategy" at the beginning of the document
2. Apply Heading 1 style to the title using applyParagraphStyle
3. Add a horizontal line below the title
4. Insert the date and author information
5. Apply a subtle background color to the header section
```

## 2. Generate and Format a Table of Contents

```
Task: "Create a table of contents for my document based on its headings."

Steps:
1. Find all text with Heading styles (1-3) using findParagraphsMatchingStyle
2. Create a "Table of Contents" section at the beginning of the document
3. Insert each heading with appropriate indentation based on its level
4. Format the TOC entries with page numbers and dotted lines
5. Apply consistent styling to the entire TOC
```

## 3. Structure a Document with Consistent Formatting

```
Task: "Apply consistent formatting throughout my document based on content type."

Steps:
1. Format all section headings with applyParagraphStyle (Heading styles, alignment)
2. Style all bullet points with consistent indentation and formatting
3. Format code samples with monospace font and background color
4. Apply consistent paragraph spacing throughout the document
5. Format all hyperlinks with a consistent color and underline style
```

## 4. Create a Professional Table for Data Presentation

```
Task: "Create a formatted comparison table of product features."

Steps:
1. Insert a table with insertTable (5 rows x 4 columns)
2. Add header row with product names
3. Add feature rows with consistent formatting
4. Apply alternating row background colors for readability
5. Format the header row with bold text and background color
6. Align numeric columns to the right
```

## 5. Prepare a Document for Formal Submission

```
Task: "Format my research paper according to academic guidelines."

Steps:
1. Set the title with centered alignment and appropriate font size
2. Format all headings according to the required style guide
3. Apply double spacing to the main text
4. Insert page numbers with appropriate format
5. Format citations consistently
6. Apply indentation to block quotes
7. Format the bibliography section
```

## 6. Create an Executive Summary with Highlights

```
Task: "Create an executive summary that emphasizes key points from my report."

Steps:
1. Insert a page break and create an "Executive Summary" section
2. Extract and format key points from the document
3. Apply bullet points for clarity
4. Highlight critical figures or statistics in bold
5. Use color to emphasize particularly important points
6. Format the summary with appropriate spacing and margins
```

## 7. Format a Document for Different Audiences

```
Task: "Create two versions of my presentation - one technical and one for executives."

Steps:
1. Duplicate the document content
2. For the technical version:
   - Add detailed technical sections
   - Include code examples with monospace formatting
   - Use technical terminology
3. For the executive version:
   - Emphasize business impact with bold and color
   - Simplify technical concepts
   - Add executive summary
   - Use more visual formatting elements
```

## 8. Create a Response Form with Structured Fields

```
Task: "Create a form-like document with fields for respondents to complete."

Steps:
1. Create section headers for different parts of the form
2. Insert tables for structured response areas
3. Add form fields with clear instructions
4. Use formatting to distinguish between instructions and response areas
5. Add checkbox lists using special characters with consistent formatting
6. Apply consistent spacing and alignment throughout
```

## 9. Format a Document with Multi-Level Lists

```
Task: "Create a project plan with properly formatted nested task lists."

Steps:
1. Insert the project title and apply Heading 1 style
2. Create main project phases with Heading 2 style
3. For each phase, create a properly formatted numbered list of tasks
4. Create sub-tasks with indented, properly formatted sub-lists
5. Apply consistent formatting to all list levels
6. Format task owners' names in bold
7. Format dates and deadlines with a consistent style
```

## 10. Prepare a Document with Advanced Layout

```
Task: "Create a newsletter-style document with columns and sections."

Steps:
1. Create a bold, centered title for the newsletter
2. Insert a horizontal line separator
3. Create differently formatted sections for:
   - Main article (left-aligned paragraphs)
   - Sidebar content (indented, smaller text)
   - Highlighted quotes (centered, italic)
4. Insert and format images with captions
5. Add a formatted footer with contact information
6. Apply consistent spacing between sections
```

These examples demonstrate the power and flexibility of the enhanced Google Docs & Drive MCP Server, showcasing how AI assistants can help with sophisticated document formatting, structuring, and comprehensive file management tasks.

## Google Drive Management Tasks

## 11. Organize Project Files Automatically

```
Task: "Set up a complete project structure and organize existing files."

Steps:
1. Create a main project folder using createFolder
2. Create subfolders for different aspects (Documents, Templates, Archive)
3. Search for project-related documents using searchGoogleDocs
4. Move relevant documents to appropriate subfolders with moveFile
5. Create a project index document listing all resources
6. Format the index with links to all project documents
```

## 12. Create Document Templates and Generate Reports

```
Task: "Set up a template system and generate standardized reports."

Steps:
1. Create a Templates folder using createFolder
2. Create template documents with placeholder text ({{DATE}}, {{NAME}}, etc.)
3. Use createFromTemplate to generate new reports from templates
4. Apply text replacements to customize each report
5. Organize generated reports in appropriate folders
6. Create a tracking document listing all generated reports
```

## 13. Archive and Clean Up Old Documents

```
Task: "Archive outdated documents and organize current files."

Steps:
1. Create an Archive folder for old documents using createFolder
2. Use getRecentGoogleDocs to find documents older than 90 days
3. Review and move old documents to Archive using moveFile
4. Delete unnecessary duplicate files using deleteFile
5. Rename documents with consistent naming conventions using renameFile
6. Create an archive index document for reference
```

## 14. Duplicate and Distribute Document Sets

```
Task: "Create personalized versions of documents for different teams."

Steps:
1. Create team-specific folders using createFolder
2. Copy master documents to each team folder using copyFile
3. Rename copied documents with team-specific names using renameFile
4. Customize document content for each team using text replacement
5. Apply team-specific formatting and branding
6. Create distribution tracking documents
```

## 15. Comprehensive File Management and Reporting

```
Task: "Generate a complete inventory and management report of all documents."

Steps:
1. Use listFolderContents to catalog all folders and their contents
2. Use getDocumentInfo to gather detailed metadata for each document
3. Create a master inventory document with all file information
4. Format the inventory as a searchable table with columns for:
   - Document name and ID
   - Creation and modification dates
   - Owner and last modifier
   - Folder location
   - File size and sharing status
5. Add summary statistics and organization recommendations
6. Set up automated folder structures for better organization
```

## Markdown Editing Tasks

## 16. Edit Documents Using Markdown

```
Task: "Retrieve a document, edit it using markdown format, and apply changes back."

Steps:
1. Retrieve document as markdown: readGoogleDoc with format='markdown'
2. Edit the markdown locally using your preferred editor (VS Code, Vim, etc.)
3. Add/modify content with markdown syntax:
   - Headings: # H1, ## H2, ### H3, etc.
   - Bold: **bold text**
   - Italic: *italic text*
   - Strikethrough: ~~strikethrough~~
   - Links: [link text](https://example.com)
   - Lists: - bullet or 1. numbered
   - Nested formatting: ***bold italic***, **[bold link](url)**
4. Apply changes with replaceDocumentWithMarkdown or appendMarkdownToGoogleDoc
5. Verify formatting preserved correctly

Benefits:
- Work offline with your favorite text editor
- Use powerful editor features (find/replace, multi-cursor, etc.)
- Version control with Git
- Batch processing with scripts
- Familiar markdown syntax for faster editing
```

## Gmail Workflow Tasks

## 17. Triage Your Unread Inbox

```
Task: "Summarize my unread emails from the last 24 hours and star the important ones."

Steps:
1. Call listMessages with q="is:unread newer_than:1d" and maxResults=25
2. For each returned ID, call getMessage with format="metadata" to get subject and sender
3. Summarize the group (sender, subject, snippet) in a single table for the user
4. For messages the user flags as important, call modifyMessageLabels with addLabelIds=["STARRED"]
5. For noise (newsletters, notifications), call modifyMessageLabels with removeLabelIds=["INBOX", "UNREAD"] to archive and mark read
```

## 18. Draft and Send a Reply Thread

```
Task: "Reply to the latest email from my manager confirming I'll attend Friday's meeting."

Steps:
1. Call listMessages with q="from:manager@company.com" and maxResults=5
2. Call getMessage with format="full" on the most recent result to read the thread context
3. Compose a concise reply based on the original
4. Call sendEmail with:
   - to: manager email
   - subject: "Re: [original subject]"
   - body: the confirmation message
   - replyToMessageId: the original message ID (ensures it lands in the same Gmail thread)
5. Confirm delivery by checking the returned threadId matches the original
```

## 19. Organize Receipts into a Custom Label

```
Task: "Find all receipts from the last 30 days and move them under a 'Receipts/2026-Q1' label."

Steps:
1. Call listLabels to find or confirm the ID for the "Receipts/2026-Q1" label (create manually in Gmail first if needed)
2. Call listMessages with q="subject:(receipt OR invoice) newer_than:30d" and maxResults=100
3. For each message, call modifyMessageLabels with:
   - addLabelIds: ["<Receipts/2026-Q1 label ID>"]
   - removeLabelIds: ["INBOX"] (to archive them from the inbox after tagging)
4. Report a count of tagged messages and their total size (from the sizeEstimate field)
5. Optionally call trashMessage on any obvious spam caught by the search
```

## Google Calendar Workflow Tasks

## 20. Plan Tomorrow from Natural Language

```
Task: "Block out my afternoon tomorrow for deep work, then add lunch with Sam at noon."

Steps:
1. Call quickAddEvent with text="Deep work tomorrow 1pm to 5pm" — Google parses the time
2. Call quickAddEvent with text="Lunch with Sam tomorrow 12pm" — second event
3. Call listEvents with timeMin set to tomorrow morning and timeMax to tomorrow night to confirm both are on the calendar
4. Report any conflicts with existing events
```

## 21. Reschedule a Meeting and Notify Attendees

```
Task: "Move the 'Design review' meeting from Tuesday 2pm to Thursday 10am and email everyone the change."

Steps:
1. Call listEvents with q="Design review" and a window covering this week
2. Identify the event ID from the result
3. Call updateEvent with:
   - eventId: <found ID>
   - start: { dateTime: "2026-04-16T10:00:00-08:00" }
   - end: { dateTime: "2026-04-16T11:00:00-08:00" }
   - sendUpdates: "all"
4. Confirm the response shows the new times
```

## 22. Triage Calendar Conflicts for the Week

```
Task: "Show me everything on my calendar this week and flag any double-bookings."

Steps:
1. Call listEvents with timeMin=Monday 00:00 and timeMax=Sunday 23:59 in the user's timezone
2. Sort events by start time
3. Walk the sorted list and detect overlaps (event[i].end > event[i+1].start)
4. For each overlap, surface the two conflicting events with their summaries and times
5. Optionally suggest deleteEvent or updateEvent calls to resolve each conflict
```
