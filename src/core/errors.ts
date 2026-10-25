export class OrbithError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrbithError';
  }
}
