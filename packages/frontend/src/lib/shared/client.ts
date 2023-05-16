export const PassphraseModalState = {
    Set: 'set',
    Lock: 'lock',
    Unlock: 'unlock',
} as const

export type PassphraseModalStates = typeof PassphraseModalState[keyof typeof PassphraseModalState]

export const PassphraseModalStateHeaderLiteral = {
    [PassphraseModalState.Set]: 'Set your passphrase',
    [PassphraseModalState.Lock]: 'Lock your encrypted data',
    [PassphraseModalState.Unlock]: 'Unlock your encrypted data',
} as const

export type PassphraseModalStateHeaderLiterals = typeof PassphraseModalStateHeaderLiteral[keyof typeof PassphraseModalStateHeaderLiteral]

export const PassphraseModalStateDescriptionLiteral = {
    [PassphraseModalState.Set]: 'Your passphrase is used to encrypt your private key. <br> Please set a strong passphrase. <br> <br> Store it safely offline.',
    [PassphraseModalState.Lock]: 'Your encrypted data will be locked. <br> You can unlock it with your passphrase.',
    [PassphraseModalState.Unlock]: 'Your encrypted data will be unlocked. <br> You can lock it with your passphrase.',
} as const

export type PassphraseModalStateDescriptionLiterals = typeof PassphraseModalStateDescriptionLiteral[keyof typeof PassphraseModalStateDescriptionLiteral]