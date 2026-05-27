function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, '0') + value
}

function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function buildPixPayload(params: {
  pixKey: string
  amount: number
  merchantName: string
  merchantCity: string
  txId?: string
}): string {
  const { pixKey, amount, merchantName, merchantCity, txId = 'RESERVA' } = params

  const cleanTxId = txId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'RESERVA'
  const cleanName = merchantName.slice(0, 25)
  const cleanCity = merchantCity.slice(0, 15).toUpperCase()

  const merchantAccountInfo =
    tlv('00', 'BR.GOV.BCB.PIX') +
    tlv('01', pixKey)

  const additionalData = tlv('05', cleanTxId)

  const payload =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', amount.toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', cleanName) +
    tlv('60', cleanCity) +
    tlv('62', additionalData) +
    '6304'

  return payload + crc16(payload)
}
