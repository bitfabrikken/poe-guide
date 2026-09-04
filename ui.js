'use strict';
const React = require('react');
const {Box, useInput} = require('ink');
const importJsx = require('import-jsx');

const {useData} = require('./hooks');
const Step = importJsx('./Step');
const Zone = importJsx('./Zone');

const App = () => {
  const {current, next, prev, zone, nextAct, prevAct, nextStep, prevStep, firstStep, lastStep, deaths, resetDeaths} = useData();

  useInput((input, key) => {
    // Home/End aren't parsed into `key` by Ink, so match the raw escape
    // sequences directly (xterm, vt220/linux console, and rxvt/urxvt variants
    // cover effectively every terminal emulator).
    const isHome = input === '[H' || input === '[1~' || input === '[7~' || input === 'OH';
    const isEnd = input === '[F' || input === '[4~' || input === '[8~' || input === 'OF';

    if (input === 'j' || key.rightArrow) {
      nextStep();
    }
    if (input === 'k' || key.leftArrow) {
      prevStep();
    }
    if (input === 'h' || key.downArrow) {
      prevAct();
    }
    if (input === 'l' || key.upArrow) {
      nextAct();
    }
    if (input === 'b' || isHome) {
      firstStep();
    }
    if (input === 'e' || isEnd) {
      lastStep();
    }
    if (input === 'r') {
      resetDeaths();
    }
    if (input === 'q') {
      process.exit(0);
    }
  });

  return (
    <Box flexDirection="column">
      <Zone zone={zone} deaths={deaths}/>
      <Box flexDirection="row" justifyContent="space-around">
        <Step step={prev} label="Previous"/>
        <Step step={current}/>
        <Step step={next} label="Next"/>
      </Box>
    </Box>
  );
};

module.exports = App;
