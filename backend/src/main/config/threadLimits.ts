/**
 * Caps the threads the process starts with.
 *
 * Shared hosting (Hostinger) counts every thread against the account's
 * process limit, 120 on the current plan. Node's libuv pool starts four
 * threads on first use whatever the machine, and nothing in this API needs
 * that many: bcrypt, file reads and sharp all queue on the pool and simply
 * wait their turn when it is busy.
 *
 * libuv reads the variable once, when the pool is first used, so this module
 * must be the first import of the entry point. A value set in the host's
 * environment wins.
 */
process.env.UV_THREADPOOL_SIZE ??= '2';
