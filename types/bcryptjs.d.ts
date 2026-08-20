declare module 'bcryptjs' {
  export function hash(value: string, saltOrRounds: string | number): Promise<string>;
}
