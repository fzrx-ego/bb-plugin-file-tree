import { useEffect, useRef } from "react";
import { useComposer } from "@get-bb/plugin-sdk/app";
import { composerScopeKey, registerChatTarget } from "@/lib/chat-draft-bus";

/** Mounted by BB inside each composer, so it writes only to that draft. */
export function ChatDraftBridge() {
  const composer = useComposer();
  const scope = composer.scope;
  const scopeKey = composerScopeKey(scope);
  const composerRef = useRef(composer);
  composerRef.current = composer;

  useEffect(() => registerChatTarget(scope, (path) => {
    composerRef.current.updateText((current) =>
      current.trimEnd() === "" ? path : `${current.trimEnd()} ${path}`,
    );
    composerRef.current.focus();
  }), [scopeKey]);

  return null;
}
