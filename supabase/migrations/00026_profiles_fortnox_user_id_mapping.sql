ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS fortnox_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_fortnox_user_id
  ON profiles(fortnox_user_id);

WITH manual_mapping(cost_center, employee_id) AS (
  VALUES
    ('24', '49'),
    ('33', '108'),
    ('32', '93'),
    ('44', '183'),
    ('34', '114'),
    ('20', '4'),
    ('22', '21'),
    ('36', '131'),
    ('3', '2'),
    ('48', '207'),
    ('50', '218'),
    ('29', '219'),
    ('52', '225'),
    ('59', '304'),
    ('61', '305'),
    ('62', '306'),
    ('63', '307'),
    ('65', '311'),
    ('67', '329'),
    ('68', '323'),
    ('69', '321'),
    ('71', '346'),
    ('75', '355'),
    ('76', '367'),
    ('78', '374'),
    ('18', '386'),
    ('80', '458'),
    ('90', '470'),
    ('85', '467'),
    ('87', '507'),
    ('89', '505'),
    ('84', '464'),
    ('88', '506'),
    ('81', '466'),
    ('91', '514'),
    ('93', '516'),
    ('94', '510'),
    ('92', '463'),
    ('96', '462'),
    ('95', '582')
)
UPDATE profiles p
SET fortnox_user_id = m.employee_id
FROM manual_mapping m
WHERE p.fortnox_cost_center = m.cost_center
  AND p.fortnox_user_id IS DISTINCT FROM m.employee_id;
