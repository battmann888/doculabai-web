"""DOCX builder — convert HTML content back to a .docx file."""

from htmldocx import HtmlToDocx
import io
from docx import Document


def html_to_docx_bytes(html: str) -> bytes:
    """Convert a full HTML document string to .docx bytes.

    Uses htmldocx to transform HTML elements (paragraphs, tables, headings,
    lists, images) into equivalent Word document structures.
    """
    document = Document()
    parser = HtmlToDocx()
    parser.add_html_to_document(html, document)

    output = io.BytesIO()
    document.save(output)
    return output.getvalue()
