#!/usr/bin/env node
// Apaga infra/secrets.local.env de forma segura:
// - sobrescreve 3 vezes com random bytes (defesa contra recuperação)
// - depois unlink
//
// Use APENAS depois de ter copiado os valores para 1Password/Bitwarden.
//
// Uso: node infra/purge-secrets.mjs

import { existsSync, statSync, openSync, writeSync, closeSync, unlinkSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const target    = resolve(__dirname, 'secrets.local.env')

if (!existsSync(target)) {
  console.log('Nada a apagar — arquivo nao existe.')
  process.exit(0)
}

const size = statSync(target).size

const rl = createInterface({ input: stdin, output: stdout })
const ans = await rl.question(`Vai apagar ${target} (${size}B). Voce ja copiou pro cofre? [s/N] `)
rl.close()
if (ans.trim().toLowerCase() !== 's') {
  console.log('Cancelado.')
  process.exit(1)
}

console.log('Sobrescrevendo com random bytes...')
const fd = openSync(target, 'r+')
for (let i = 0; i < 3; i++) writeSync(fd, randomBytes(size), 0, size, 0)
closeSync(fd)
unlinkSync(target)
console.log('✓ Apagado.')
