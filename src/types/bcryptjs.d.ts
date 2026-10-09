declare module 'bcryptjs' {
  export function setRandomFallback(random: (length: number) => number[]): void
  export function genSaltSync(rounds?: number): string
  export function genSalt(rounds?: number, callback?: (error: Error | undefined, salt: string) => void): Promise<string> | void
  export function hashSync(data: string, saltOrRounds: string | number): string
  export function hash(data: string, saltOrRounds: string | number, callback?: (error: Error | undefined, hash: string) => void): Promise<string> | void
  export function compareSync(data: string, encrypted: string): boolean
  export function compare(data: string, encrypted: string, callback?: (error: Error | undefined, same: boolean) => void): Promise<boolean> | void

  const bcrypt: {
    setRandomFallback: typeof setRandomFallback
    genSaltSync: typeof genSaltSync
    genSalt: typeof genSalt
    hashSync: typeof hashSync
    hash: typeof hash
    compareSync: typeof compareSync
    compare: typeof compare
  }
  export default bcrypt
}
