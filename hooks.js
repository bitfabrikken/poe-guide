const {useEffect, useState} = require('react');
const fs = require('fs');
const config = require('./config');
const Tail = require('tail').Tail;

const {zones} = require('./data/zones.poe2-0.5.json');
const {acts} = require('./data/steps.poe2-0.5.json');

// Find the zones.json entry for a step. Never throws: an unmapped zone
// degrades to a minimal stub instead of crashing the app.
const getZone = step => {
  if (!step) {
    return null;
  }

  const found = zones.find(zone => zone.name === step.zone && zone.act === step.act && zone.difficulty === step.difficulty);
  if (found) {
    return found;
  }

  console.error(`poe-guide: no zone data for "${step.zone}" (Act ${step.act} ${step.difficulty})`);
  return {name: step.zone, act: step.act, difficulty: step.difficulty, tags: [], level: 0};
};

// Flatten (chapter, step) into a single linear index across the whole
// route, so we can measure "distance" between two points regardless of
// chapter boundaries.
const flattenIndex = (chapter, step) => {
  let index = step;
  for (let c = 1; c < chapter; c++) {
    index += acts[c - 1].steps.length;
  }

  return index;
};

const unflattenIndex = index => {
  let chapter = 1;
  while (index >= acts[chapter - 1].steps.length) {
    index -= acts[chapter - 1].steps.length;
    chapter += 1;
  }

  return {chapter, step: index};
};

// 'chapter' is the 1-based position in the acts array (Act1 Normal..Act4
// Normal, then Act1 Cruel..Act3 Cruel). It's distinct from the real PoE2
// act number (1-4) shown to the user, since Normal and Cruel both reuse
// act numbers 1-3.
//
// A zone name can recur far apart in the route (e.g. town is revisited
// many times within an act, and reused again across Normal/Cruel), so we
// scan the whole route for the nearest matching name rather than only
// checking the immediate neighbor - "nearest to current position" also
// naturally picks the right difficulty pass without needing to track it
// separately.
const checkMovement = (chapter, step, zoneName) => {
  if (!zoneName) {
    return {chapter, step};
  }

  const currentIndex = flattenIndex(chapter, step);
  let best = null;
  let bestDistance = Infinity;

  for (let c = 1; c <= acts.length; c++) {
    const steps = acts[c - 1].steps;
    for (let s = 0; s < steps.length; s++) {
      if (steps[s].zone !== zoneName) {
        continue;
      }

      const index = flattenIndex(c, s);
      if (index === currentIndex) {
        return {chapter, step};
      }

      // Prefer the nearest match ahead of us; only fall back to a match
      // behind us if nothing ahead exists (e.g. backtracking to town).
      const distance = index > currentIndex ? index - currentIndex : (currentIndex - index) + 0.5;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
  }

  if (best === null) {
    return {chapter, step};
  }

  return unflattenIndex(best);
};

const handlers = {};

const registerHandler = (name, re, func) => {
	handlers[name] = { name, re, func };
};

const lineHandler = data => {
  for (const name in handlers) {
    const handler = handlers[name];
    const match = data.match(handler.re);

    if (match) {
      handler.func(match);
    }
  }
};

const errorHandler = error => {
  console.log('ERROR: ', error);
};

const getNextStep = (chapter, step) => {
  let nextStep = getStep(chapter, step + 1);

  if (!nextStep) {
    return getStep(chapter + 1, 0);
  }

  return nextStep;
};

const getPrevStep = (chapter, step) => {
  if (step > 0) {
    return getStep(chapter, step - 1);
  }

  if (chapter === 1) {
    return null;
  }

  let prevChapter = acts[chapter - 2];
  return getStep(chapter - 1, prevChapter.steps.length - 1);
};

const getStep = (chapter, step) => {
  if (chapter < 1 || chapter > acts.length) {
    return null;
  }

  let currentChapter = acts[chapter - 1];
  if (step < 0 || step >= currentChapter.steps.length) {
    return null;
  }

  return {
    chapter,
    step,
    act: currentChapter.act,
    difficulty: currentChapter.difficulty,
    ...currentChapter.steps[step]
  };
};

const getData = (location, chapter, step) => {
  const current = getStep(chapter, step);
  return {
    location,
    chapter,
    step,
    prev: getPrevStep(chapter, step),
    current: current,
    next: getNextStep(chapter, step),
    zone: getZone(current)
  };
};

const LOADING_SCREEN_RE = /\[LOADING SCREEN\] \(([^)]+)\) Duration/g;

// Plenty of recent play history without having to re-read a Client.txt
// that can grow to hundreds of MB over a long-lived install.
const RESUME_TAIL_BYTES = 2 * 1024 * 1024;

const readLogTail = logPath => {
  const {size} = fs.statSync(logPath);
  const start = Math.max(0, size - RESUME_TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const fd = fs.openSync(logPath, 'r');
  try {
    fs.readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    fs.closeSync(fd);
  }

  return buffer.toString('utf8');
};

// On startup, replay recent zone loads from the log through the same
// movement logic used live, so the guide resumes near where the player
// actually left off instead of always starting back at Act 1.
const resumeFromLog = () => {
  let chapter = 1;
  let step = 0;
  let location = zones[0].name;

  const logPath = config.get('log');
  if (!logPath) {
    return {location, chapter, step};
  }

  let contents;
  try {
    contents = readLogTail(logPath);
  } catch (error) {
    return {location, chapter, step};
  }

  for (const match of contents.matchAll(LOADING_SCREEN_RE)) {
    const zoneName = match[1];
    const movement = checkMovement(chapter, step, zoneName);

    if (movement.chapter !== chapter || movement.step !== step) {
      ({chapter, step} = movement);
      location = zoneName;
    }
  }

  return {location, chapter, step};
};

const initial = resumeFromLog();
const initialData = getData(initial.location, initial.chapter, initial.step);

const useData = () => {
  const [data, setData] = useState(initialData);
  const [deaths, setDeaths] = useState(0);

  const firstStep = () => {
    setData(getData(data.location, 1, 0));
  };

  const lastStep = () => {
    setData(getData(data.location, acts.length, 0));
  };

  const prevAct = () => {
    if (data.chapter === 1) return;

    setData(getData(data.location, data.chapter - 1, 0));
  };

  const nextAct = () => {
    if (data.chapter === acts.length) return;

    setData(getData(data.location, data.chapter + 1, 0));
  };

  const nextStep = () => {
    if (data.step + 1 === acts[data.chapter - 1].steps.length) {
      // we're at the end of the act
      nextAct();
      return;
    }

    setData(getData(data.location, data.chapter, data.step + 1));
  };

  const prevStep = () => {
    if (data.step === 0) {
      if (data.chapter === 1) return;

      setData(getData(data.location, data.chapter - 1, acts[data.chapter - 2].steps.length - 1));
      return;
    };

    setData(getData(data.location, data.chapter, data.step - 1));
  };

  const resetDeaths = () => {
    setDeaths(0);
  };

  useEffect(() => {
    registerHandler("location", /\[LOADING SCREEN\] \(([^)]+)\) Duration/, (matches) => {
      const zoneName = matches[1];

      const movement = checkMovement(data.chapter, data.step, zoneName);

      if (movement.chapter !== data.chapter || movement.step !== data.step) {
        setData(getData(zoneName, movement.chapter, movement.step));
      }
    });

    registerHandler("deaths", /.*has been slain/, (matches) => {
      setDeaths(deaths + 1);
    });

    const tail = new Tail(config.get('log'), {useWatchFile:true, fsWatchOptions:{interval: 1000}});
    tail.on("line", lineHandler);
    tail.on("error", errorHandler);

    return () => {
      tail.unwatch();
      for (const key in handlers) {
        delete handlers[key];
      }
    };
  });

  return {
    ...data,
    nextAct,
    prevAct,
    nextStep,
    prevStep,
    firstStep,
    lastStep,
    deaths,
    resetDeaths
  }
};

exports.useData = useData;
exports.getZone = getZone;
