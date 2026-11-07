// Errors thrown by the model. Both carry messages safe to show to the user.

/** A routine document (from storage or an imported file) breaks the format rules. */
export class RoutineFormatError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "RoutineFormatError";
    this.path = path;
  }
}

/** An edit was requested whose preconditions do not hold. */
export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditError";
  }
}
