import SmartRoutingPanel from "../components/SmartRoutingPanel";

export default function ModelsRoute() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Models</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-fg-strong">Smart router matrix</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-muted">
          Inspect how agent roles map to provider/model pairs, then run a lightweight latency sample before switching routes.
        </p>
      </div>
      <SmartRoutingPanel />
    </div>
  );
}
