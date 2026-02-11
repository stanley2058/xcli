type ParsedArgv = {
  positionals: string[];
  opts: Record<string, string | boolean>;
};

function isFlag(s: string): boolean {
  return s.startsWith("-") && s !== "-";
}

export function parseArgv(argv: string[]): ParsedArgv {
  const positionals: string[] = [];
  const opts: Record<string, string | boolean> = {};

  let i = 0;
  let passthrough = false;

  while (i < argv.length) {
    const cur = argv[i]!;

    if (!passthrough && cur === "--") {
      passthrough = true;
      i += 1;
      continue;
    }

    if (passthrough || !isFlag(cur)) {
      positionals.push(cur);
      i += 1;
      continue;
    }

    if (cur.startsWith("--")) {
      const eq = cur.indexOf("=");
      if (eq !== -1) {
        const key = cur.slice(2, eq);
        const val = cur.slice(eq + 1);
        opts[key] = val;
        i += 1;
        continue;
      }

      const key = cur.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !isFlag(next)) {
        opts[key] = next;
        i += 2;
        continue;
      }
      opts[key] = true;
      i += 1;
      continue;
    }

    // Short flags: -h
    if (cur.length === 2) {
      opts[cur.slice(1)] = true;
      i += 1;
      continue;
    }

    // Unknown form, treat as positional.
    positionals.push(cur);
    i += 1;
  }

  return { positionals, opts };
}
