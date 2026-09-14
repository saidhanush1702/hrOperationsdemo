UPDATE users u
INNER JOIN employees e ON e.user_id = u.id
SET u.is_active = 0
WHERE e.termination_date IS NOT NULL
  AND u.is_active = 1;
