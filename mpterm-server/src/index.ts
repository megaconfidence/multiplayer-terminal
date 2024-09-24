import { DurableObject } from 'cloudflare:workers';

// interface Env {
// 	MY_DURABLE_OBJECT: DurableObjectNamespace<import('./src/index').MyDurableObject>;
// }

export class MyDurableObject extends DurableObject {
	storage: any;
	sessions: any;
	constructor(ctx: any, env: Env) {
		super(ctx, env);
		this.storage = ctx.storage;

		//keep track of connected sessions
		this.sessions = new Map();
		this.ctx.getWebSockets().forEach((ws) => {
			this.sessions.set(ws, { ...ws.deserializeAttachment() });
		});
	}
	async fetch(_req: Request) {
		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1]);
		this.sessions.set(pair[1], {});
		return new Response(null, { status: 101, webSocket: pair[0] });
	}
	webSocketMessage(ws: WebSocket, msg: string | object) {
		const session = this.sessions.get(ws);
		if (!session.id) {
			session.id = crypto.randomUUID();
			ws.serializeAttachment({ ...ws.deserializeAttachment(), id: session.id });
			ws.send(JSON.stringify({ ready: true, id: session.id }));
		}
		this.broadcast(ws, msg);
	}
	broadcast(sender: WebSocket, msg: string | object) {
		const id = this.sessions.get(sender).id;
		for (let [ws] of this.sessions) {
			if (sender == ws) continue;
			switch (typeof msg) {
				case 'string':
					ws.send(JSON.stringify({ ...JSON.parse(msg), id }));
					break;
				default:
					ws.send(JSON.stringify({ ...msg, id }));
					break;
			}
		}
	}
	close(ws: WebSocket) {
		const session = this.sessions.get(ws);
		if (!session?.id) return;
		this.broadcast(ws, { type: 'left' });
		this.sessions.delete(ws);
	}
	webSocketClose(ws: WebSocket) {
		this.close(ws);
	}
	webSocketError(ws: WebSocket) {
		this.close(ws);
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request, env, _ctx): Promise<Response> {
		const upgrade = request.headers.get('Upgrade');
		if (!upgrade || upgrade != 'websocket') {
			return new Response('Expected upgrade to websocket', { status: 426 });
		}
		const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(new URL(request.url).pathname);
		const veet = env.MY_DURABLE_OBJECT.get(id);
		return veet.fetch(request);
	},
} satisfies ExportedHandler<Env>;
