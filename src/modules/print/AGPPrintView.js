/* eslint-disable lodash/prefer-lodash-method */

import _ from 'lodash';
import i18next from 'i18next';
import Plotly from 'plotly.js';

import PrintView from './PrintView';
import {
  AGP_TIR_MIN_HEIGHT,
  colors,
  fontSizes,
  text,
} from './utils/AGPConstants';

import { MS_IN_MIN } from '../../utils/constants';
import { getPatientFullName } from '../../utils/misc';
import { formatDecimalNumber } from '../../utils/format';
import { formatBirthdate, getOffset } from '../../utils/datetime';
import moment from 'moment/moment';

const agpLogo = require('./images/capturAGP-logo.png');
const t = i18next.t.bind(i18next);

class AGPPrintView extends PrintView {
  constructor(doc, data, opts) {
    super(doc, data, opts);

    // TODO: override with AGP colors
    this.colors = _.assign(this.colors, {
      axes: '#858585',
    });

    console.log('this', this);

    this.cbgData = _.get(data, 'data.current.data.cbg', []);
    this.cbgStats = _.get(data, 'data.current.stats', {});

    const reportInfoAndMetricsWidth = this.dpi * 3.375;
    const chartRenderAreaTop = this.dpi * 0.75;
    const chartRenderAreaBottom = this.bottomEdge - (this.dpi * 0.75 - this.margins.bottom);
    const sectionGap = this.dpi * 0.25;
    this.chartSectionBorderRadius = 8;

    this.sections = {};
    this.sections.timeInRanges = {
      x: this.leftEdge,
      y: chartRenderAreaTop,
      width: this.dpi * 3.875,
      height: this.dpi * 3,
      bordered: true,
      text: text.timeInRanges,
    };

    this.sections.reportInfo = {
      x: this.rightEdge - reportInfoAndMetricsWidth,
      y: chartRenderAreaTop,
      width: reportInfoAndMetricsWidth,
      height: this.dpi * 0.875,
      text: text.reportInfo,
    };

    this.sections.glucoseMetrics = {
      x: this.rightEdge - reportInfoAndMetricsWidth,
      y: this.sections.reportInfo.y + this.sections.reportInfo.height + sectionGap,
      width: reportInfoAndMetricsWidth,
      height: this.dpi * 1.875,
      bordered: true,
      text: text.glucoseMetrics,
    };

    this.sections.ambulatoryGlucoseProfile = {
      x: this.leftEdge,
      y: this.dpi * 4,
      width: this.width,
      height: this.dpi * 3.75,
      bordered: true,
      text: text.ambulatoryGlucoseProfile,
    };

    const dailyThumbnailsHeight = this.dpi * 2.25;
    this.sections.dailyThumbnails = {
      x: this.leftEdge,
      y: chartRenderAreaBottom - dailyThumbnailsHeight,
      width: this.width,
      height: dailyThumbnailsHeight,
      bordered: true,
      text: text.dailyThumbnails,
    };

    this.doc.addPage();
    this.initLayout();
  }

  // we don't call the super here, since we don't want the standard tidepool header and footer
  // super.newPage(this.getDateRange(this.endpoints.range[0], this.endpoints.range[1] - 1));
  newPage() {}

  initLayout() {
    this.setLayoutColumns({
      width: this.width,
      gutter: 15,
      type: 'percentage',
      widths: [25.5, 49, 25.5],
    });
  }

  async render() {
    this.renderHeader();
    this.renderFooter();
    // this.renderGuides();
    this.renderSectionContainers();
    this.renderReportInfo();
    await this.renderTimeInRanges();
  }

  renderHeader() {
    this.doc.font(this.boldFont).fontSize(fontSizes.reportHeader);
    const xPos = this.leftEdge;
    const yPos = this.topEdge;

    this.doc
      .fillColor(colors.text.reportHeader)
      .fillOpacity(1)
      .text(`${text.reportHeader} `, xPos, yPos, { continued: true })
      .font(this.font)
      .text(text.reportSubHeader);
  }

  renderFooter() {
    this.doc.font(this.font).fontSize(fontSizes.reportFooter);
    const xPos = this.leftEdge;
    const yPos = this.bottomEdge - this.doc.currentLineHeight() * 1.25;

    this.doc
      .fillColor(colors.text.reportFooter)
      .fillOpacity(1)
      .text(text.reportFooter, xPos, yPos);

    this.logoWidth = 70;
    const logoX = this.doc.page.width - this.logoWidth - this.margins.right;
    const logoY = this.bottomEdge - this.logoWidth * 0.175;

    this.doc.image(agpLogo, logoX, logoY, { width: this.logoWidth });
  }

  renderGuides() {
    // page margins
    this.doc.lineWidth(1)
      .dash(3, { space: 4 })
      .rect(this.margins.left, this.margins.top, this.width, this.height)
      .stroke('#EEEEEE');

    _.each(_.values(this.sections), section => {
      this.doc.lineWidth(1)
        .rect(section.x, section.y, section.width, section.height)
        .stroke('#EEEEEE');
    });

    this.doc.undash();
  }

  renderSectionContainers() {
    const headerHeight = this.dpi * 0.25;
    this.resetText();

    _.each(this.sections, section => {
      if (section.bordered) {
        // Draw section container
        this.doc
          .roundedRect(section.x, section.y, section.width, section.height, this.chartSectionBorderRadius)
          .fill(colors.background.shaded);
        this.doc
          .rect(section.x + 1, section.y + 1 + headerHeight, section.width - 2, this.chartSectionBorderRadius)
          .fill(colors.white);
        this.doc
          .roundedRect(section.x + 1, section.y + 1 + headerHeight, section.width - 2, section.height - 2 - headerHeight, this.chartSectionBorderRadius - 1)
          .fill(colors.white);
      }

      // Add section titles, subtitles, and descriptions
      if (section.text?.title) {
        const titlePaddingX = 8;
        const titleXPos = section.x + titlePaddingX;
        const titleYPos = section.y + 1 + ((headerHeight - this.doc.currentLineHeight()) / 2);
        this.setFill(colors.text.section.title);

        this.doc.font(this.boldFont)
          .fontSize(fontSizes.section.title);

        this.doc.text(section.text.title, titleXPos, titleYPos);

        if (section.text.subtitle) {
          const subtitleXPos = titleXPos + this.doc.widthOfString(section.text.title) + (this.dpi * 0.4);

          this.setFill(colors.text.section.subtitle);

          this.doc.font(this.font)
            .fontSize(fontSizes.section.subtitle);

          this.doc.text(section.text.subtitle, subtitleXPos, section.y + 1 + ((headerHeight - this.doc.currentLineHeight()) / 2));
        }
      }

      if (section.text?.description) {
        const descriptionPaddingX = this.dpi * 0.5;
        const descriptionXPos = section.x + descriptionPaddingX;
        const descriptionYPos = section.y + headerHeight + (this.dpi * 0.2);

        this.setFill(colors.text.section.description);

        this.doc.font(this.font)
          .fontSize(fontSizes.section.description);

        this.doc.text(section.text.description, descriptionXPos, descriptionYPos);
      }
    });
  }

  renderReportInfo() {
    const section = this.sections.reportInfo;
    const patientName = _.truncate(getPatientFullName(this.patient), { length: 32 });
    const patientBirthdate = formatBirthdate(this.patient);
    const { cgmDaysWorn = 0, oldestDatum, newestDatum, sensorUsageAGP } = this.stats.sensorUsage?.data?.raw || {};

    let cgmDaysWornText = cgmDaysWorn === 1
      ? t('{{cgmDaysWorn}} Day', { cgmDaysWorn })
      : t('{{cgmDaysWorn}} Days', { cgmDaysWorn });

    if (cgmDaysWorn >= 1) {
      cgmDaysWornText += `: ${cgmDaysWorn === 1
        ? moment.utc(newestDatum?.time - getOffset(newestDatum?.time, this.timezone) * MS_IN_MIN).format('MMMM D, YYYY')
        : this.getDateRange(oldestDatum?.time, newestDatum?.time, undefined, '', 'MMMM')
      }`;
    }

    const renderInfoRow = (mainText, subTextLabel, subText) => {
      const x = this.doc.x;
      const y = this.doc.y;
      let subTextWidth = 0;

      if (subText) {
        this.doc
          .font(this.boldFont)
          .fontSize(fontSizes.reportInfo.default);

        subTextWidth = this.doc.widthOfString(subText);

        this.doc.text(subText, x, y, {
          align: 'right',
          width: section.width,
        });

        if (subTextLabel) {
          this.doc
            .font(this.font)
            .fontSize(fontSizes.reportInfo.label);

          this.doc.text(subTextLabel, x, y + 1, {
            align: 'right',
            width: section.width - subTextWidth - this.dpi * 0.025,
          });
        }
      }

      this.doc
        .font(this.boldFont)
        .fontSize(fontSizes.reportInfo.default)
        .text(mainText, x, y);

      const lineYPos = y + this.doc.currentLineHeight() + this.dpi * 0.025;

      this.doc
        .moveTo(section.x, lineYPos)
        .lineWidth(0.25)
        .lineTo(section.x + section.width, lineYPos)
        .strokeColor(colors.line.default)
        .stroke();

      this.doc.x = x;
    };

    this.doc.x = section.x;
    this.doc.y = section.y + this.dpi * 0.05;
    renderInfoRow(patientName, text.reportInfo.dob, patientBirthdate);
    this.doc.moveDown(1);
    renderInfoRow(cgmDaysWornText);
    this.doc.moveDown(1);
    renderInfoRow(`Time CGM Active: ${formatDecimalNumber(sensorUsageAGP, 1)}%`);
  }

  async renderTimeInRanges() {
    const stat = this.stats.timeInRange;
    const statHasData = _.get(stat, 'data.total.value') > 0;
    const { timeInRanges } = this.sections;

    // Set chart plot within section borders
    this.doc.x = timeInRanges.x + 1 + this.chartSectionBorderRadius;
    this.doc.y = timeInRanges.y + 1 + this.dpi * 0.25;
    const chartAreaWidth = timeInRanges.width - 2 - this.chartSectionBorderRadius * 2;
    const chartAreaHeight = timeInRanges.height - 2 - this.dpi * 0.25;
    const plotMarginX = this.dpi * 0.375;
    const plotMarginY = this.dpi * 0.375;
    const imageRenderScale = 8;

    if (statHasData) {
      const statDatums = _.get(stat, 'data.data', []);
      const statTotal = _.get(stat, 'data.total.value', 1);

      const tickValues = _.reduce(statDatums, (res, datum, i) => ([
        ...res,
        (res[i - 1] || 0) + _.max([_.toNumber(datum.value) / statTotal * 1, AGP_TIR_MIN_HEIGHT / 100]),
      ]), []);

      console.log('statDatums', statDatums);
      const data = _.map(statDatums, datum => ({
        x: [stat.id],
        // TODO: Multiply percentage by desired total bar height to ensure combined height === 1?
        // This would ensure that we're always at the appropriate height, even if a couple ranges
        // have no data and render the min height.  Would have to calculate the y-values ahead of
        // time, in this case, summing them, then adjusting to total 1.0 to match chart domain
        y: [_.max([_.toNumber(datum.value) / statTotal * 1, AGP_TIR_MIN_HEIGHT / 100])],
        name: datum.id,
        type: 'bar',
        width: 0.25,
        marker: {
          color: _.toNumber(datum.value) > 6 ? colors.bgRange[datum.id] : colors.bgRange.empty,
          line: {
            color: colors.line.range.divider,
            width: 1.5 * imageRenderScale,
          },
        },
        cliponaxis: false,
        // TBD: Stat text
        // TODO: Use annotations instead - not enough positional flexibility with built-in text
        text: datum.id,
        textposition: 'outside',
        constraintext: 'none',
        // texttemplate: '%{text} (%{y:.2f})',
        // textposition: 'center right', // this should allow the top and bottom to differ
        textfont: {
          color: colors.black,
          family: 'Arial',
          size: fontSizes.timeInRanges.values * imageRenderScale,
        },
      }));

      const layout = {
        autosize: true,
        barmode: 'stack',
        width: chartAreaWidth * imageRenderScale,
        height: chartAreaHeight * imageRenderScale,
        margin: {
          autoexpand: false,
          l: plotMarginX * imageRenderScale,
          r: plotMarginX * imageRenderScale,
          b: plotMarginY * imageRenderScale,
          t: plotMarginY * imageRenderScale,
          pad: 0,
        },

        font: {
          color: colors.black,
          family: 'Arial',
          size: 7 * imageRenderScale,
        },

        showlegend: false,
        xaxis: {
          range: [0, 1],
          zeroline: false,
          showgrid: false,
          showticklabels: false,
          showline: false,
          layer: 'below traces',
        },
        yaxis: {
          range: [0, 1],
          zeroline: false,
          showgrid: false,
          showline: false,
          layer: 'below traces',
          tickvals: tickValues.slice(0, 4), // TODO: set ticks in data array?
          tickfont: {
            color: colors.black,
            size: fontSizes.timeInRanges.ticks * imageRenderScale,
            family: 'Arial',
            // can set color, family, size - can't see weight anywhere, though if I bundle the font family, should work
          },
          tickwidth: 8,
          tickcolor: 'transparent',
          ticktext: [
            this.bgBounds.veryLowThreshold,
            this.bgBounds.targetLowerBound,
            this.bgBounds.targetUpperBound,
            this.bgBounds.veryHighThreshold,
          ],
        },
        // shapes: [
        //   {
        //     layer: 'above',
        //     type: 'path',
        //     path: createSvgRectWithBorderRadius(50, 50, { tl: 10, tr: 10, bl: 10, br: 10 }),
        //     xsizemode: 'pixel',
        //     xanchor: 0,
        //     // x: 0,
        //     ysizemode: 'pixel',
        //     yanchor: 1.1,
        //     // y: 10,
        //     fillcolor: 'green',
        //     opacity: 0.5,
        //     line: {
        //       color: 'grey',
        //       width: 1,
        //     },
        //   },
        // ],

        // TBD:
        // template: {
        //   // defaults to apply to a plot, such as colors, fonts, line widths, etc
        //   // https://plotly.com/javascript/reference/layout/#layout-template
        // },

        // meta: {
        //   // custom text variables - may come in useful for built-in data text (not necessary for annotations)
        //   // https://plotly.com/javascript/reference/layout/#layout-meta
        // },
      };

      const plotDataURL = await Plotly.toImage({ data, layout });
      this.doc.image(plotDataURL, undefined, undefined, { width: chartAreaWidth, height: chartAreaHeight });
    }
  }
}

export default AGPPrintView;
