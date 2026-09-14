-- Files now live in Cloudinary, so these columns hold full https URLs instead of
-- short local paths. 700 chars leaves room for long URLs while staying indexable.
ALTER TABLE timesheets MODIFY attachment_url VARCHAR(700) NULL;
ALTER TABLE invoices MODIFY invoice_file_path VARCHAR(700) DEFAULT NULL;
ALTER TABLE organizations MODIFY logo_url VARCHAR(700) NULL;
ALTER TABLE employee_documents MODIFY file_url VARCHAR(700) NOT NULL;
