CREATE TABLE IF NOT EXISTS audit_logs (
    id           CHAR(36)     PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    module       VARCHAR(50)  NOT NULL,
    action       VARCHAR(100) NOT NULL,
    entity_type  VARCHAR(100) NOT NULL,
    entity_id    VARCHAR(100) DEFAULT NULL,
    entity_name  VARCHAR(255) DEFAULT NULL,
    performed_by CHAR(36)     NOT NULL,
    performed_by_name VARCHAR(255) DEFAULT NULL,
    performed_by_role VARCHAR(50)  DEFAULT NULL,
    description  TEXT         DEFAULT NULL,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_org_module   (organization_id, module),
    INDEX idx_created_at   (created_at),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);
