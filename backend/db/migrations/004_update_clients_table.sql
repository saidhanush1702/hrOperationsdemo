-- Create Lookup Table for Client Contact Types
CREATE TABLE IF NOT EXISTS lkp_client_contact_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- Add optional address and fax_number to clients
ALTER TABLE clients 
ADD COLUMN address TEXT DEFAULT NULL AFTER website,
ADD COLUMN fax_number VARCHAR(50) DEFAULT NULL AFTER address;

-- Add contact_type_id to client_contacts (and drop contact_type if you accidentally created it as a string previously)
ALTER TABLE client_contacts 
ADD COLUMN contact_type_id INT DEFAULT NULL AFTER contact_title;

ALTER TABLE client_contacts 
ADD CONSTRAINT fk_client_contact_type FOREIGN KEY (contact_type_id) REFERENCES lkp_client_contact_types(id) ON DELETE SET NULL;