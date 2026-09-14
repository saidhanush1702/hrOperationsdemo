-- Repair timesheet attachment_url values holding a '?' where the file on disk holds '_'.
--
-- Same class of defect as seed 017 (which fixed ':' the same way), from the same
-- old-portal import. The uploads are mostly macOS screenshots, whose original
-- filenames carry a character that is not legal in a filename. The importer's file
-- writer sanitised it to '_' when saving into blob/, but the value written to
-- attachment_url kept a literal '?'. The two have disagreed ever since, so the
-- attachment 404s even though the file is sitting in blob/ under the '_' spelling.
--
-- The '?' is a real ASCII question mark stored in the column (HEX() yields 3F, and
-- CHAR_LENGTH = LENGTH on every affected row), not a display artefact of a
-- mis-declared client charset -- so REPLACE matches it directly.
--
-- Scope: blob/ URLs only. Attachments written by this application land under
-- /uploads/documents/ via sanitizeBaseName(), which strips '?' before the row is
-- ever written, so those rows cannot be affected and are left alone.
--
-- Verified against production before writing this migration:
--   329 rows match, each containing exactly one '?'
--   313 of them have the '_' spelling present in blob/ and start resolving again
--    16 have neither spelling on disk -- those files are genuinely gone, and this
--       migration only normalises their recorded name. They stay broken until the
--       documents themselves are recovered, which is tracked separately.
--     0 rewrites collide with an attachment_url already held by another timesheet.
--
-- Idempotent: once rewritten a row no longer contains '?', so the WHERE excludes it
-- and a re-run matches nothing.

UPDATE timesheets
SET attachment_url = REPLACE(attachment_url, '?', '_')
WHERE attachment_url LIKE 'blob/%'
  AND attachment_url LIKE '%?%';
