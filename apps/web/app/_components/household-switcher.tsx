"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api-client";

interface Household {
  id: string;
  name: string;
  role: string;
}

export function HouseholdSwitcher() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let active = true;
    void apiRequest<{ households: Household[] }>("/v1/households")
      .then(({ households: values }) => {
        if (!active) return;
        setHouseholds(values);
        const stored = window.localStorage.getItem("legacy-vault.household-id");
        const next = values.some((item) => item.id === stored)
          ? (stored ?? "")
          : (values[0]?.id ?? "");
        setSelected(next);
        if (next)
          window.localStorage.setItem("legacy-vault.household-id", next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!households.length) return null;
  return (
    <div className="household-switcher">
      <label htmlFor="active-household">Active household</label>
      <select
        id="active-household"
        value={selected}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setSelected(value);
          window.localStorage.setItem("legacy-vault.household-id", value);
          window.dispatchEvent(new Event("legacy-vault:household-change"));
        }}
      >
        {households.map((household) => (
          <option key={household.id} value={household.id}>
            {household.name} — {household.role}
          </option>
        ))}
      </select>
    </div>
  );
}
