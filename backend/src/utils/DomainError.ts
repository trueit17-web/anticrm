// A thrown error carrying the HTTP status it should map to — handlers can
// just `throw new DomainError(403, "...")` from anywhere (including deep
// utility functions like resolveBranchId) and asyncHandler's `.catch(next)`
// routes it to app.ts's central error handler, which turns it into the
// right response instead of a generic 500.
export class DomainError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "DomainError";
  }
}
