export type CloudWorkbenchState<TSchedule, TRecords, TInformation> = {
  schedule: TSchedule;
  records: TRecords;
  information: TInformation;
};

async function errorMessage(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: { message?: string }; message?: string };
    return body.error?.message || body.message || fallback;
  } catch {
    return fallback;
  }
}

export async function loadWorkbenchState<TSchedule, TRecords, TInformation>() {
  const response = await fetch("/api/workbench-state", {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(await errorMessage(response, "加载云端数据失败"));
  const body = await response.json() as {
    data: CloudWorkbenchState<TSchedule, TRecords, TInformation>;
  };
  return body.data;
}

export async function saveWorkbenchState<TSchedule, TRecords, TInformation>(
  state: CloudWorkbenchState<TSchedule, TRecords, TInformation>,
) {
  const response = await fetch("/api/workbench-state", {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error(await errorMessage(response, "保存云端数据失败"));
}
