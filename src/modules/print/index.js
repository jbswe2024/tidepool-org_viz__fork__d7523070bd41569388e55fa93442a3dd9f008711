/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2017, Tidepool Project
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 *
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */

/* global PDFDocument, blobStream */

import DailyPrintView from './DailyPrintView';
import { reshapeBgClassesToBgBounds } from '../../utils/bloodglucose';
import { getTimezoneFromTimePrefs } from '../../utils/datetime';
import { selectDailyViewData as selectData } from './data';

// DPI here is the coordinate system, not the resolution; sub-dot precision renders crisply!
const DPI = 72;
const MARGIN = DPI / 2;

/**
 * createDailyPrintView
 * @param {Object} doc - PDFKit document instance
 * @param {Object} data - pre-munged data for the daily print view
 * @param {Object} bgBounds - user's blood glucose thresholds & targets
 * @param {String} timezone - user's configured named timezone
 * @param {Number} numDays - number of days of daily view to include in printout
 *
 * @return {Object} dailyPrintView instance
 */
export function createDailyPrintView(doc, data, bgBounds, timezone, numDays) {
  const CHARTS_PER_PAGE = 3;
  return new DailyPrintView(doc, data, {
    bgBounds,
    chartsPerPage: CHARTS_PER_PAGE,
    // TODO: set this up as a Webpack Define plugin to pull from env variable
    // maybe that'll be tricky through React Storybook?
    debug: false,
    defaultFontSize: 8,
    dpi: DPI,
    footerFontSize: 8,
    headerFontSize: 14,
    height: 11 * DPI - (2 * MARGIN),
    margins: {
      left: MARGIN,
      top: MARGIN,
      right: MARGIN,
      bottom: MARGIN,
    },
    numDays,
    summaryHeaderFontSize: 10,
    summaryWidthAsPercentage: 0.15,
    timezone,
    width: 8.5 * DPI - (2 * MARGIN),
  });
}

/**
 * createAndOpenPrintPDFPackage
 * @param {String} mostRecent - an ISO 8601-formatted timestamp of the most recent diabetes datum
 * @param {Object} dataByDate - a Crossfilter dimension for querying diabetes data by normalTime
 * @param {Object} opts - an object of print options (see destructured param below)
 *
 * @return {Void} [side effect function creates and opens PDF in new tab]
 */
export default function createAndOpenPrintPDFPackage(mostRecent, dataByDate, {
  // full opts will be { bgPrefs, dateTitle, patientName, numDays, timePrefs }
  bgPrefs, numDays, timePrefs,
}) {
  const bgBounds = reshapeBgClassesToBgBounds(bgPrefs);
  const timezone = getTimezoneFromTimePrefs(timePrefs);
  const data = selectData(mostRecent, dataByDate, numDays, timezone);
  /* NB: if you don't set the `margin` (or `margins` if not all are the same)
     then when you are using the .text() command a new page will be added if you specify
     coordinates outside of the default margin (or outside of the margins you've specified)
   */
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margin: MARGIN });
  const stream = doc.pipe(blobStream());
  const dailyPrintView = createDailyPrintView(doc, data, bgBounds, timezone, numDays);
  dailyPrintView.render();

  doc.end();

  stream.on('finish', () => {
    window.open(stream.toBlobURL('application/pdf'));
    // const printWindow = window.open(stream.toBlobURL('application/pdf'));
    // printWindow.focus();
    // printWindow.print();
  });
}
