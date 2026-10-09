import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

// bcryptjs 2's dynamic crypto require can be lost in the Nitro ESM bundle.
// Supply Node's cryptographically secure generator for bundled deployments.
bcrypt.setRandomFallback((length: number) => Array.from(randomBytes(length)))

export default bcrypt
