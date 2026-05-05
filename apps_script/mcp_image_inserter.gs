/**
 * MCP Google Docs Server — Apps Script Image Inserter
 *
 * Finds [mcp-img-FILEID] markers in a document and replaces each one
 * with the corresponding Drive image (looked up by file ID).
 *
 * Deployed as an API Executable so the MCP server can call it via
 * google.script('v1').scripts.run().
 *
 * Setup:
 *   1. Create a new Apps Script project at https://script.google.com
 *   2. Link the project to the SAME Google Cloud project as the OAuth client
 *      used by mcp-googledocs-server (Project Settings → Change project).
 *   3. Paste this file's contents.
 *   4. Deploy → New deployment → Select type: API Executable → Deploy.
 *   5. Copy the Deployment ID into secrets.yaml under
 *      google.apps_script_deployment_id.
 */

/**
 * Replace a single [mcp-img-<fileId>] marker with the actual image.
 *
 * @param {string} documentId  Google Docs document ID
 * @param {string} driveFileId Google Drive file ID of the uploaded image
 * @param {number} [maxWidthRatio=0.8]  Max fraction of page width
 * @param {number} [maxHeightPx=500]    Max height in pixels
 * @return {object} { success, message }
 */
function insertImageByFileId(documentId, driveFileId, maxWidthRatio, maxHeightPx) {
  maxWidthRatio = maxWidthRatio || 0.8;
  maxHeightPx = maxHeightPx || 500;

  try {
    var doc = DocumentApp.openById(documentId);
    var body = doc.getBody();

    var marker = '[mcp-img-' + driveFileId + ']';
    var found = body.findText('\\[mcp-img-' + escapeRegex(driveFileId) + '\\]');

    if (!found) {
      return { success: false, message: 'Marker not found: ' + marker };
    }

    var textEl = found.getElement().asText();
    var start = found.getStartOffset();
    var endIncl = found.getEndOffsetInclusive();

    var file = DriveApp.getFileById(driveFileId);
    var blob = file.getBlob();

    textEl.deleteText(start, endIncl);

    var paragraph = textEl.getParent().asParagraph();
    var childIndex = paragraph.getChildIndex(textEl);
    var insertPos = start === 0 ? childIndex : childIndex + 1;
    var inlineImage = paragraph.insertInlineImage(insertPos, blob);

    // Resize
    var pageWidthPts = body.getPageWidth();
    var marginLeftPts = body.getMarginLeft();
    var marginRightPts = body.getMarginRight();
    var availableWidthPts = pageWidthPts - marginLeftPts - marginRightPts;
    var POINTS_PER_INCH = 72;
    var IMAGE_DPI = 96;
    var availableWidthPx = Math.round((availableWidthPts * IMAGE_DPI) / POINTS_PER_INCH);

    var imgWidth = inlineImage.getWidth();
    var imgHeight = inlineImage.getHeight();
    var maxWidth = Math.round(availableWidthPx * maxWidthRatio);

    var targetWidth = imgWidth;
    var targetHeight = imgHeight;
    var scale = 1;

    if (imgWidth > maxWidth) {
      scale = maxWidth / imgWidth;
    }
    if (imgHeight * scale > maxHeightPx) {
      scale = maxHeightPx / imgHeight;
    }
    if (scale < 1) {
      targetWidth = Math.round(imgWidth * scale);
      targetHeight = Math.round(imgHeight * scale);
      inlineImage.setWidth(targetWidth);
      inlineImage.setHeight(targetHeight);
    }

    return {
      success: true,
      message: 'Inserted image (' + targetWidth + 'x' + targetHeight + ')',
    };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.toString() };
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
