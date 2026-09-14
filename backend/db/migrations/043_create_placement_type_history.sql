
CREATE TABLE IF NOT EXISTS placement_type_history (
    id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
    placement_id        VARCHAR(36)  NOT NULL,
    pay_type_id         INT          NOT NULL,
    run_as_per_lca_wage TINYINT(1)   NOT NULL DEFAULT 0,
    start_date          DATE         NOT NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by          VARCHAR(36)  NULL,
    CONSTRAINT fk_pth_placement FOREIGN KEY (placement_id) REFERENCES placements(id)  ON DELETE CASCADE,
    CONSTRAINT fk_pth_pay_type  FOREIGN KEY (pay_type_id)  REFERENCES lkp_pay_types(id)
);

CREATE INDEX idx_pth_placement_date ON placement_type_history (placement_id, start_date);
INSERT INTO placement_type_history (id, placement_id, pay_type_id, run_as_per_lca_wage, start_date, created_by)
SELECT
    UUID(),
    p.id,
    p.pay_type_id,
    COALESCE(p.run_as_per_lca_wage, 0),
    p.start_date,
    p.created_by
FROM placements p
WHERE p.pay_type_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM placement_type_history pth WHERE pth.placement_id = p.id
  );
