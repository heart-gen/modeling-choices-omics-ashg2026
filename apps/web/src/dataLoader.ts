import type { ScenarioBundle, ScenarioIndex } from "./types";

const baseUrl = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Unable to load ${path}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function loadScenarioIndex(): Promise<ScenarioIndex> {
  return getJson<ScenarioIndex>("data/scenarios/index.json");
}

export async function loadScenario(file: string): Promise<ScenarioBundle> {
  return getJson<ScenarioBundle>(`data/scenarios/${file}`);
}
