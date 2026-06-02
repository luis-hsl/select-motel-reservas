-- Adiciona setting "motel_notification_phone": telefone que recebe avisos de nova reserva.
-- E garante que "whatsapp_number" exista (numero exibido ao cliente / usado pelo cliente).
INSERT INTO settings (key, value, label)
VALUES
  ('motel_notification_phone', '', 'Telefone que recebe avisos de nova reserva (DDI+DDD+numero)'),
  ('whatsapp_number',          '5543999999999', 'Numero de WhatsApp exibido ao cliente')
ON CONFLICT (key) DO NOTHING;
