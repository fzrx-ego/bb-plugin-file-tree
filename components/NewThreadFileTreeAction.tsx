import { useEffect } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { writeStoredOpen } from "@/lib/rail-state";
import { registerSurfaceNavigation } from "@/lib/surface-navigation";

export function NewThreadFileTreeAction() {
  const navigate = useBbNavigate();
  useEffect(() => registerSurfaceNavigation(null, navigate), [navigate]);
  return (
    <Button type="button" variant="ghost" size="icon" className="size-7"
      aria-label="Show file tree" onClick={() => writeStoredOpen(true)}>
      <Icon name="FolderTree" className="size-4" />
    </Button>
  );
}
