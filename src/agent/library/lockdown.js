import 'ses';

// This sets up the secure environment
// We disable some of the taming to allow for more flexibility

// For configuration, see https://github.com/endojs/endo/blob/master/packages/ses/docs/lockdown.md

let lockeddown = false;
export function lockdown() {
  if (lockeddown) return;
  lockeddown = true;
  lockdown({
    // basic devex and quality of life improvements
    localeTaming: 'unsafe',
    consoleTaming: 'unsafe',
    errorTaming: 'unsafe',
    stackFiltering: 'verbose',
    // NOTE: 'unsafeEval' is required for compatibility with mineflayer's
    // 'protodef' dependency which uses eval internally. Switching to
    // 'safeEval' or 'noEval' breaks mineflayer. AI-generated code still runs
    // inside a sandboxed Compartment (see makeCompartment below), so the
    // outer eval exposure is limited to trusted application dependencies only.
    evalTaming: 'unsafeEval',
  });
}

export const makeCompartment = (endowments = {}) => {
  return new Compartment({
    // provide untamed Math, Date, etc
    Math,
    Date,
    // standard endowments
    ...endowments
  });
};