import {
  createFixtureTransport,
  createFixtureChatAdapter,
  type GadgetChatAdapter,
  GADGET_TRANSPORT_PROTOCOL,
  type GadgetTransport,
  type GadgetCallRefusal,
  type GadgetHostContext
} from "@agenticos-dev/gadget-sdk";

const context: GadgetHostContext = {
  protocolVersion: GADGET_TRANSPORT_PROTOCOL,
  gadgetId: "fixture-only",
  selected: [{ type: "draft", id: "example", revision: 1 }]
};
const fixture = createFixtureTransport({
  handlers: {
    read: (args, host) => ({ ok: true, value: { args, selected: host.selected } }),
    publish: () => ({ ok: false, code: "fixture_pending", message: "Simulated", pending: true })
  }
});
const transport: GadgetTransport = fixture;
const result = await transport.call({ protocolVersion: GADGET_TRANSPORT_PROTOCOL, method: "read", args: [], context });
if (!result.ok) {
  const code: string = result.code;
  const message: string = result.message;
  void [code, message];
}
const dispose: () => void = transport.subscribe(event => { void event; });
dispose();
transport.close();

// @ts-expect-error A refusal needs its machine code and display message.
const malformedRefusal: GadgetCallRefusal = { ok: false };
// @ts-expect-error Protocol versions are not arbitrary within negotiated context.
const malformedContext: GadgetHostContext = { protocolVersion: "unknown" };
// @ts-expect-error Arguments must be an array, not a free-form object.
void transport.call({ protocolVersion: GADGET_TRANSPORT_PROTOCOL, method: "read", args: {} });
// @ts-expect-error Fixture event injection is not a production transport method.
transport.emit({});
void [malformedRefusal, malformedContext];

const chat: GadgetChatAdapter = createFixtureChatAdapter({
  context: { workspaceId: "fixture", conversationId: "fixture-chat" },
  handlers: { send: () => ({ ok: false, code: "simulated", message: "Not live", pending: true }) }
});
await chat.send({ text: "Refine", selected: [{ type: "draft", id: "one", revision: 1 }] });
await chat.answer({ actionId: "ask", approve: false });
// @ts-expect-error Approval is an explicit boolean, not display text.
void chat.answer({ actionId: "ask", approve: "approve" });
// @ts-expect-error Public host adapters do not expose fixture injection.
chat.emit({});
// @ts-expect-error A selection revision is numeric, never prose.
void chat.send({ text: "Refine", selected: [{ type: "draft", id: "one", revision: "latest" }] });
chat.close();
