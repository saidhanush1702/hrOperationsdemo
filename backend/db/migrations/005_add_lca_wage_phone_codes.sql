-- Add LCA Wage to employee immigrations
ALTER TABLE employee_immigrations
ADD COLUMN lca_wage DECIMAL(13, 2) DEFAULT NULL AFTER till_date;

-- Add phone code reference to client contacts
ALTER TABLE client_contacts
ADD COLUMN phone_code_id INT DEFAULT NULL AFTER contact_email;

ALTER TABLE client_contacts
ADD CONSTRAINT fk_client_contact_phone_code FOREIGN KEY (phone_code_id) REFERENCES lkp_phone_codes(id) ON DELETE SET NULL;