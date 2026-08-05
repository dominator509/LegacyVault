import { Algorithm, hash, verify, type Options } from "@node-rs/argon2";

const options: Options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export function verifyPassword(input: {
  password: string;
  hash: string;
}): Promise<boolean> {
  return verify(input.hash, input.password, options);
}
