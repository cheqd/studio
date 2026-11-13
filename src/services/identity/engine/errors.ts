/**
 * Engine-neutral errors raised by the router itself (engine spec 3.3). Engines map their own failures into the
 * same model; these are the ones that never reach an engine.
 */

/** The operation was withdrawn and is refused whatever the engine. Maps to HTTP 410. */
export class EngineGoneError extends Error {
	readonly code = 'Gone';
	readonly status = 410;

	constructor(message: string) {
		super(message);
		this.name = 'Gone';
	}
}
