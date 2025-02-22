import { ImageSource, profile } from '@nativescript/core';
import { Align, Canvas, Direction, LayoutAlignment, Paint, Path, RectF, StaticLayout, Style, releaseImage } from '@nativescript-community/ui-canvas';
import { DataRenderer } from './DataRenderer';
import { ChartAnimator } from '../animation/ChartAnimator';
import { PieChart } from '../charts/PieChart';
import { ValuePosition } from '../data/PieDataSet';
import { Highlight } from '../highlight/Highlight';
import { IPieDataSet } from '../interfaces/datasets/IPieDataSet';
import { ColorTemplate } from '../utils/ColorTemplate';
import { MPPointF } from '../utils/MPPointF';
import { Utils } from '../utils/Utils';
import { ViewPortHandler } from '../utils/ViewPortHandler';

export class PieChartRenderer extends DataRenderer {
    protected mChart: PieChart;

    /**
     * Bitmap for drawing the center hole
     */
    protected mDrawBitmap: WeakRef<ImageSource>;

    protected mBitmapCanvas: Canvas;

    /**
     * palet for the hole in the center of the pie chart and the transparent
     * circle
     */
    protected mHolePaint: Paint;
    protected mTransparentCirclePaint: Paint;

    /**
     * palet object for the text that can be displayed in the center of the
     * chart
     */
    private mCenterTextPaint: Paint;

    /**
     * palet object used for drwing the slice-text
     */
    private mEntryLabelsPaint: Paint;

    private mCenterTextLayout: StaticLayout;
    private mCenterTextLastValue;
    private mCenterTextLastBounds: RectF;
    protected get centerTextLastBounds() {
        if (!this.mCenterTextLastBounds) {
            this.mCenterTextLastBounds = new RectF(0, 0, 0, 0);
        }
        return this.mCenterTextLastBounds;
    }
    private mRectBuffer: RectF[];
    protected get rectBuffer() {
        if (!this.mRectBuffer) {
            this.mRectBuffer = [new RectF(0, 0, 0, 0), new RectF(0, 0, 0, 0)];
        }
        return this.mRectBuffer;
    }

    constructor(chart: PieChart, animator: ChartAnimator, viewPortHandler: ViewPortHandler) {
        super(animator, viewPortHandler);
        this.mChart = chart;
    }

    public get centerTextPaint() {
        if (!this.mCenterTextPaint) {
            this.mCenterTextPaint = Utils.getTemplatePaint('black-fill');
            this.mCenterTextPaint.setTextSize(12);
        }
        return this.mCenterTextPaint;
    }
    public get entryLabelsPaint() {
        if (!this.mEntryLabelsPaint) {
            this.mEntryLabelsPaint = Utils.getTemplatePaint('white-fill');
            this.mEntryLabelsPaint.setTextAlign(Align.CENTER);
            this.mEntryLabelsPaint.setTextSize(13);
        }
        return this.mEntryLabelsPaint;
    }
    public get transparentCirclePaint() {
        if (!this.mTransparentCirclePaint) {
            this.mTransparentCirclePaint = Utils.getTemplatePaint('white-fill');
            this.mTransparentCirclePaint.setAlpha(105);
        }
        return this.mTransparentCirclePaint;
    }
    public get holePaint() {
        if (!this.mHolePaint) {
            this.mHolePaint = Utils.getTemplatePaint('white-fill');
        }
        return this.mHolePaint;
    }
    public get valuePaint() {
        if (!this.mValuePaint) {
            this.mValuePaint = Utils.getTemplatePaint('value');
            this.mValuePaint.setColor('white');
            this.mValuePaint.setTextSize(13);
        }
        return this.mValuePaint;
    }

    @profile
    public drawData(c: Canvas) {
        const width = this.mViewPortHandler.getChartWidth();
        const height = this.mViewPortHandler.getChartHeight();

        let drawBitmap = this.mDrawBitmap == null ? null : this.mDrawBitmap.get();

        if (drawBitmap == null || drawBitmap.width !== width || drawBitmap.height !== height) {
            if (width > 0 && height > 0) {
                this.mBitmapCanvas = new Canvas(width, height);
                drawBitmap = this.mBitmapCanvas.getImage();
                this.mDrawBitmap = new WeakRef(drawBitmap);
            } else {
                return;
            }
        } else {
            this.mBitmapCanvas.clear();
        }

        let needsBitmapDrawing = false;
        const pieData = this.mChart.getData();
        for (const set of pieData.getDataSets()) {
            needsBitmapDrawing = this.drawDataSet(c, set) || needsBitmapDrawing;
        }
        if (needsBitmapDrawing) {
            const renderPaint = this.renderPaint;
            c.drawBitmap(drawBitmap, 0, 0, renderPaint);
        }
    }

    protected calculateMinimumRadiusForSpacedSlice(center: MPPointF, radius, angle, arcStartPointX, arcStartPointY, startAngle, sweepAngle) {
        const angleMiddle = startAngle + sweepAngle / 2;

        // Other polet of the arc
        const arcEndPointX = center.x + radius * Math.cos((startAngle + sweepAngle) * Utils.DEG2RAD);
        const arcEndPointY = center.y + radius * Math.sin((startAngle + sweepAngle) * Utils.DEG2RAD);

        // Middle polet on the arc
        const arcMidPointX = center.x + radius * Math.cos(angleMiddle * Utils.DEG2RAD);
        const arcMidPointY = center.y + radius * Math.sin(angleMiddle * Utils.DEG2RAD);

        // This is the base of the contained triangle
        const basePointsDistance = Math.sqrt(Math.pow(arcEndPointX - arcStartPointX, 2) + Math.pow(arcEndPointY - arcStartPointY, 2));

        // After reducing space from both sides of the "slice",
        //   the angle of the contained triangle should stay the same.
        // So let's find out the height of that triangle.
        const containedTriangleHeight = (basePointsDistance / 2.0) * Math.tan(((180.0 - angle) / 2.0) * Utils.DEG2RAD);

        // Now we subtract that from the radius
        let spacedRadius = radius - containedTriangleHeight;

        // And now subtract the height of the arc that's between the triangle and the outer circle
        spacedRadius -= Math.sqrt(Math.pow(arcMidPointX - (arcEndPointX + arcStartPointX) / 2, 2) + Math.pow(arcMidPointY - (arcEndPointY + arcStartPointY) / 2, 2));

        return spacedRadius;
    }

    /**
     * Calculates the sliceSpace to use based on visible values and their size compared to the set sliceSpace.
     *
     * @param dataSet
     * @return
     */
    protected getSliceSpace(dataSet: IPieDataSet) {
        if (!dataSet.isAutomaticallyDisableSliceSpacingEnabled()) {
            return dataSet.getSliceSpace();
        }

        const spaceSizeRatio = dataSet.getSliceSpace() / this.mViewPortHandler.getSmallestContentExtension();
        const minValueRatio = (dataSet.getYMin() / this.mChart.getData().getYValueSum()) * 2;

        const sliceSpace = spaceSizeRatio > minValueRatio ? 0 : dataSet.getSliceSpace();

        return sliceSpace;
    }

    protected drawDataSet(c: Canvas, dataSet: IPieDataSet) {
        const result = false;
        let angle = 0;

        const yKey = dataSet.yProperty;
        const rotationAngle = this.mChart.getRotationAngle();

        const phaseX = this.mAnimator.getPhaseX();
        const phaseY = this.mAnimator.getPhaseY();

        const circleBox = this.mChart.getCircleBox();

        const entryCount = dataSet.getEntryCount();
        const drawAngles = this.mChart.getDrawAngles();
        const center = this.mChart.getCenterCircleBox();
        const radius = this.mChart.getRadius();
        const drawInnerArc = this.mChart.isDrawHoleEnabled() && !this.mChart.isDrawSlicesUnderHoleEnabled();
        const userInnerRadius = drawInnerArc ? radius * (this.mChart.getHoleRadius() / 100) : 0;
        const roundedRadius = (radius - (radius * this.mChart.getHoleRadius()) / 100) / 2;
        const roundedCircleBox = new RectF(0, 0, 0, 0);
        const drawRoundedSlices = drawInnerArc && this.mChart.isDrawRoundedSlicesEnabled();

        let visibleAngleCount = 0;
        for (let j = 0; j < entryCount; j++) {
            // draw only if the value is greater than zero
            if (Math.abs(dataSet.getEntryForIndex(j)[yKey]) > Utils.NUMBER_EPSILON) {
                visibleAngleCount++;
            }
        }

        const sliceSpace = visibleAngleCount <= 1 ? 0 : this.getSliceSpace(dataSet);

        const customRender = this.mChart.getCustomRenderer();
        const renderPaint = this.renderPaint;
        const pathBuffer = Utils.getTempPath();
        const previousShader = renderPaint.getShader();
        const shader = dataSet.getFillShader();
        if (shader) {
            renderPaint.setShader(shader);
        }
        for (let j = 0; j < entryCount; j++) {
            const sliceAngle = drawAngles[j];
            let innerRadius = userInnerRadius;

            const e = dataSet.getEntryForIndex(j);

            // draw only if the value is greater than zero
            if (!(Math.abs(e[yKey]) > Utils.NUMBER_EPSILON)) {
                angle += sliceAngle * phaseX;
                continue;
            }

            // Don't draw if it's highlighted, unless the chart uses rounded slices
            if (this.mChart.needsHighlight(j) && !drawRoundedSlices) {
                angle += sliceAngle * phaseX;
                continue;
            }

            const accountForSliceSpacing = sliceSpace > 0 && sliceAngle <= 180;

            renderPaint.setColor(dataSet.getColor(j));

            const sliceSpaceAngleOuter = visibleAngleCount === 1 ? 0 : sliceSpace / (Utils.DEG2RAD * radius);
            const startAngleOuter = rotationAngle + (angle + sliceSpaceAngleOuter / 2) * phaseY;
            let sweepAngleOuter = (sliceAngle - sliceSpaceAngleOuter) * phaseY;
            if (sweepAngleOuter < 0) {
                sweepAngleOuter = 0;
            }

            pathBuffer.reset();

            if (drawRoundedSlices) {
                const x = center.x + (radius - roundedRadius) * Math.cos(startAngleOuter * Utils.DEG2RAD);
                const y = center.y + (radius - roundedRadius) * Math.sin(startAngleOuter * Utils.DEG2RAD);
                roundedCircleBox.set(x - roundedRadius, y - roundedRadius, x + roundedRadius, y + roundedRadius);
            }

            const arcStartPointX = center.x + radius * Math.cos(startAngleOuter * Utils.DEG2RAD);
            const arcStartPointY = center.y + radius * Math.sin(startAngleOuter * Utils.DEG2RAD);

            if (sweepAngleOuter >= 360 && sweepAngleOuter % 360 <= Utils.NUMBER_EPSILON) {
                // Android is doing "mod 360"
                pathBuffer.addCircle(center.x, center.y, radius, Direction.CW);
            } else {
                if (drawRoundedSlices) {
                    pathBuffer.arcTo(roundedCircleBox, startAngleOuter + 180, -180);
                }

                pathBuffer.arcTo(circleBox, startAngleOuter, sweepAngleOuter);
            }

            // Android API < 21 does not receive floats in addArc, but a RectF

            if (drawInnerArc && (innerRadius > 0 || accountForSliceSpacing)) {
            const innerRectBuffer = Utils.getTempRectF()
            innerRectBuffer.set(center.x - innerRadius, center.y - innerRadius, center.x + innerRadius, center.y + innerRadius);
            if (accountForSliceSpacing) {
                    let minSpacedRadius = this.calculateMinimumRadiusForSpacedSlice(center, radius, sliceAngle * phaseY, arcStartPointX, arcStartPointY, startAngleOuter, sweepAngleOuter);

                    if (minSpacedRadius < 0) {
                        minSpacedRadius = -minSpacedRadius;
                    }

                    innerRadius = Math.max(innerRadius, minSpacedRadius);
                }

                const sliceSpaceAngleInner = visibleAngleCount === 1 || innerRadius === 0 ? 0 : sliceSpace / (Utils.DEG2RAD * innerRadius);
                const startAngleInner = rotationAngle + (angle + sliceSpaceAngleInner / 2) * phaseY;
                let sweepAngleInner = (sliceAngle - sliceSpaceAngleInner) * phaseY;
                if (sweepAngleInner < 0) {
                    sweepAngleInner = 0;
                }
                const endAngleInner = startAngleInner + sweepAngleInner;

                if (sweepAngleOuter >= 360 && sweepAngleOuter % 360 <= Utils.NUMBER_EPSILON) {
                    // Android is doing "mod 360"
                    pathBuffer.addCircle(center.x, center.y, innerRadius, Direction.CCW);
                } else {
                    if (drawRoundedSlices) {
                        const x = center.x + (radius - roundedRadius) * Math.cos(endAngleInner * Utils.DEG2RAD);
                        const y = center.y + (radius - roundedRadius) * Math.sin(endAngleInner * Utils.DEG2RAD);
                        roundedCircleBox.set(x - roundedRadius, y - roundedRadius, x + roundedRadius, y + roundedRadius);
                        pathBuffer.arcTo(roundedCircleBox, endAngleInner, 180);
                    } else {
                        pathBuffer.lineTo(center.x + innerRadius * Math.cos(endAngleInner * Utils.DEG2RAD), center.y + innerRadius * Math.sin(endAngleInner * Utils.DEG2RAD));
                    }

                    pathBuffer.arcTo(innerRectBuffer, endAngleInner, -sweepAngleInner);
                }
            } else {
                if (sweepAngleOuter % 360 > Utils.NUMBER_EPSILON) {
                    if (accountForSliceSpacing) {
                        const angleMiddle = startAngleOuter + sweepAngleOuter / 2;

                        const sliceSpaceOffset = this.calculateMinimumRadiusForSpacedSlice(center, radius, sliceAngle * phaseY, arcStartPointX, arcStartPointY, startAngleOuter, sweepAngleOuter);

                        const arcEndPointX = center.x + sliceSpaceOffset * Math.cos(angleMiddle * Utils.DEG2RAD);
                        const arcEndPointY = center.y + sliceSpaceOffset * Math.sin(angleMiddle * Utils.DEG2RAD);

                        pathBuffer.lineTo(arcEndPointX, arcEndPointY);
                    } else {
                        pathBuffer.lineTo(center.x, center.y);
                    }
                }
            }

            pathBuffer.close();
            if (customRender && customRender.drawSlice) {
                customRender.drawSlice(c, e, pathBuffer, renderPaint);
            } else {
                c.drawPath(pathBuffer, renderPaint);
            }

            angle += sliceAngle * phaseX;
        }
        renderPaint.setShader(previousShader);

        return result;
    }

    public drawValues(c: Canvas) {
        const drawEntryLabels = this.mChart.isDrawEntryLabelsEnabled();
        const data = this.mChart.getData();
        const dataSets = data.getDataSets();
        if (!drawEntryLabels || dataSets.some((d) => d.isDrawValuesEnabled() || d.isDrawIconsEnabled()) === false) {
            return;
        }
        const center = this.mChart.getCenterCircleBox();

        // Get whole the radius
        const radius = this.mChart.getRadius();
        let rotationAngle = this.mChart.getRotationAngle();
        const drawAngles = this.mChart.getDrawAngles();
        const absoluteAngles = this.mChart.getAbsoluteAngles();

        const phaseX = this.mAnimator.getPhaseX();
        const phaseY = this.mAnimator.getPhaseY();

        const roundedRadius = (radius - (radius * this.mChart.getHoleRadius()) / 100) / 2;
        const holeRadiusPercent = this.mChart.getHoleRadius() / 100;
        let labelRadiusOffset = (radius / 10) * 3.6;

        if (this.mChart.isDrawHoleEnabled()) {
            labelRadiusOffset = (radius - radius * holeRadiusPercent) / 2;

            if (!this.mChart.isDrawSlicesUnderHoleEnabled() && this.mChart.isDrawRoundedSlicesEnabled()) {
                // Add curved circle slice and spacing to rotation angle, so that it sits nicely inside
                rotationAngle += (roundedRadius * 360) / (Math.PI * 2 * radius);
            }
        }

        const labelRadius = radius - labelRadiusOffset;

        const yValueSum = data.getYValueSum();

        let angle;
        let xIndex = 0;

        c.save();

        const offset = 5;

        const paint = this.valuePaint;
        const entryLabelsPaint: Paint = drawEntryLabels ? this.entryLabelsPaint : undefined;
        const customRender = this.mChart.getCustomRenderer();
        const valueLinePaint = Utils.getTempPaint();
        valueLinePaint.setStyle(Style.STROKE);
        for (let i = 0; i < dataSets.length; i++) {
            const dataSet = dataSets[i];
            const drawValues = dataSet.isDrawValuesEnabled();

            if (!drawValues) {
                continue;
            }

            const yKey = dataSet.yProperty;
            const xValuePosition = dataSet.getXValuePosition();
            const yValuePosition = dataSet.getYValuePosition();

            // Apply the text-styling defined by the DataSet
            this.applyValueTextStyle(dataSet);

            const lineHeight = Utils.calcTextHeight(paint, 'Q') + 4;

            const formatter = dataSet.getValueFormatter();

            const entryCount = dataSet.getEntryCount();

            valueLinePaint.setColor(dataSet.getValueLineColor());
            valueLinePaint.setStrokeWidth(dataSet.getValueLineWidth());

            const sliceSpace = this.getSliceSpace(dataSet);

            const iconsOffset = dataSet.getIconsOffset();
            const valuesOffset = dataSet.getValuesOffset();

            const isDrawIconsEnabled = dataSet.isDrawIconsEnabled();
            for (let j = 0; j < entryCount; j++) {
                const entry = dataSet.getEntryForIndex(j);

                if (xIndex === 0) {
                    angle = 0;
                } else {
                    angle = absoluteAngles[xIndex - 1] * phaseX;
                }

                const sliceAngle = drawAngles[xIndex];
                const sliceSpaceMiddleAngle = sliceSpace / (Utils.DEG2RAD * labelRadius);

                // offset needed to center the drawn text in the slice
                const angleOffset = (sliceAngle - sliceSpaceMiddleAngle / 2) / 2;

                angle = angle + angleOffset;

                const transformedAngle = rotationAngle + angle * phaseY;

                const value = this.mChart.isUsePercentValuesEnabled() ? (entry[yKey] / yValueSum) * 100 : entry[yKey];
                const formattedValue = formatter.getPieLabel(value, entry);
                const entryLabel = entry.label;

                const sliceXBase = Math.cos(transformedAngle * Utils.DEG2RAD);
                const sliceYBase = Math.sin(transformedAngle * Utils.DEG2RAD);

                const drawXOutside = drawEntryLabels && xValuePosition === ValuePosition.OUTSIDE_SLICE;
                const drawYOutside = drawValues && yValuePosition === ValuePosition.OUTSIDE_SLICE;
                const drawXInside = drawEntryLabels && xValuePosition === ValuePosition.INSIDE_SLICE;
                const drawYInside = drawValues && yValuePosition === ValuePosition.INSIDE_SLICE;

                if (drawXOutside || drawYOutside) {
                    const valueLineLength1 = dataSet.getValueLinePart1Length();
                    const valueLineLength2 = dataSet.getValueLinePart2Length();
                    const valueLinePart1OffsetPercentage = dataSet.getValueLinePart1OffsetPercentage() / 100;

                    let pt2x, pt2y;
                    let labelPtx, labelPty;

                    let line1Radius;

                    if (this.mChart.isDrawHoleEnabled()) {
                        line1Radius = (radius - radius * holeRadiusPercent) * valueLinePart1OffsetPercentage + radius * holeRadiusPercent;
                    } else {
                        line1Radius = radius * valueLinePart1OffsetPercentage;
                    }

                    const polyline2Width = dataSet.isValueLineVariableLength() ? labelRadius * valueLineLength2 * Math.abs(Math.sin(transformedAngle * Utils.DEG2RAD)) : labelRadius * valueLineLength2;

                    const pt0x = line1Radius * sliceXBase + center.x;
                    const pt0y = line1Radius * sliceYBase + center.y;

                    const pt1x = labelRadius * (1 + valueLineLength1) * sliceXBase + center.x;
                    const pt1y = labelRadius * (1 + valueLineLength1) * sliceYBase + center.y;

                    if (transformedAngle % 360.0 >= 90.0 && transformedAngle % 360.0 <= 270.0) {
                        pt2x = pt1x - polyline2Width;
                        pt2y = pt1y;

                        paint.setTextAlign(Align.RIGHT);

                        if (drawXOutside) {
                            entryLabelsPaint.setTextAlign(Align.RIGHT);
                        }

                        labelPtx = pt2x - offset;
                        labelPty = pt2y;
                    } else {
                        pt2x = pt1x + polyline2Width;
                        pt2y = pt1y;
                        paint.setTextAlign(Align.LEFT);

                        if (drawXOutside) {
                            entryLabelsPaint.setTextAlign(Align.LEFT);
                        }

                        labelPtx = pt2x + offset;
                        labelPty = pt2y;
                    }

                    if (dataSet.getValueLineColor() !== ColorTemplate.COLOR_NONE) {
                        if (dataSet.isUsingSliceColorAsValueLineColor()) {
                            valueLinePaint.setColor(dataSet.getColor(j));
                        }

                        c.drawLine(pt0x, pt0y, pt1x, pt1y, valueLinePaint);
                        c.drawLine(pt1x, pt1y, pt2x, pt2y, valueLinePaint);
                    }

                    // draw everything, depending on settings
                    if (drawXOutside && drawYOutside) {
                        this.drawValue(c, formattedValue, labelPtx + valuesOffset.x, labelPty + valuesOffset.y, dataSet.getValueTextColor(j), paint, customRender);

                        if (j < data.getEntryCount() && entryLabel != null) {
                            this.drawEntryLabel(c, entryLabel, labelPtx, labelPty + lineHeight, entryLabelsPaint);
                        }
                    } else if (drawXOutside) {
                        if (j < data.getEntryCount() && entryLabel != null) {
                            this.drawEntryLabel(c, entryLabel, labelPtx, labelPty + lineHeight / 2, entryLabelsPaint);
                        }
                    } else if (drawYOutside) {
                        this.drawValue(c, formattedValue, labelPtx + valuesOffset.x, labelPty + valuesOffset.y + lineHeight / 2, dataSet.getValueTextColor(j), paint, customRender);
                    }
                }

                if (drawXInside || drawYInside) {
                    // calculate the text position
                    const x = labelRadius * sliceXBase + center.x;
                    const y = labelRadius * sliceYBase + center.y;

                    paint.setTextAlign(Align.CENTER);

                    // draw everything, depending on settings
                    if (drawXInside && drawYInside) {
                        this.drawValue(c, formattedValue, x + valuesOffset.x, y + valuesOffset.y, dataSet.getValueTextColor(j), paint, customRender);

                        if (j < data.getEntryCount() && entryLabel != null) {
                            this.drawEntryLabel(c, entryLabel, x, y + lineHeight, entryLabelsPaint);
                        }
                    } else if (drawXInside) {
                        if (j < data.getEntryCount() && entryLabel != null) {
                            this.drawEntryLabel(c, entryLabel, x, y + lineHeight / 2, entryLabelsPaint);
                        }
                    } else if (drawYInside) {
                        this.drawValue(c, formattedValue, x + valuesOffset.x, y + valuesOffset.y + lineHeight / 2, dataSet.getValueTextColor(j), paint, customRender);
                    }
                }

                if (isDrawIconsEnabled && entry.icon != null) {
                    const icon = entry.icon;

                    const x = (labelRadius + iconsOffset.y) * sliceXBase + center.x;
                    let y = (labelRadius + iconsOffset.y) * sliceYBase + center.y;
                    y += iconsOffset.x;

                    Utils.drawIcon(c, this.mChart, icon, x, y);
                }

                xIndex++;
            }
        }
        c.restore();
    }

    /**
     * Draws an entry label at the specified position.
     *
     * @param c
     * @param label
     * @param x
     * @param y
     */
    protected drawEntryLabel(c: Canvas, label, x, y, paint: Paint) {
        c.drawText(label.toString(), x, y, paint);
    }

    public drawExtras(c: Canvas) {
        this.drawHole(c);
        if (this.mDrawBitmap.get()) {
            c.drawBitmap(this.mDrawBitmap.get(), 0, 0, null);
        }
        this.drawCenterText(c);
    }

    /**
     * Draws the hole in the center of the chart and the transparent circle /
     * hole.
     */
    protected drawHole(c: Canvas) {
        if (this.mChart.isDrawHoleEnabled()) {
            const radius = this.mChart.getRadius();
            const holeRadius = radius * (this.mChart.getHoleRadius() / 100);
            const center = this.mChart.getCenterCircleBox();
            const paint = this.holePaint;
            if (ColorTemplate.getColorInstance(paint.getColor()).a > 0) {
                // draw the hole-circle
                c.drawCircle(center.x, center.y, holeRadius, paint);
            }
            const transparentCirclePaint = this.transparentCirclePaint;
            // only draw the circle if it can be seen (not covered by the hole)
            if (ColorTemplate.getColorInstance(transparentCirclePaint.getColor()).a > 0 && this.mChart.getTransparentCircleRadius() > this.mChart.getHoleRadius()) {
                const alpha = transparentCirclePaint.getAlpha();
                const secondHoleRadius = radius * (this.mChart.getTransparentCircleRadius() / 100);

                transparentCirclePaint.setAlpha(alpha * this.mAnimator.getPhaseX() * this.mAnimator.getPhaseY());

                // draw the transparent-circle
                const path = Utils.getTempPath();
                path.reset();
                path.addCircle(center.x, center.y, secondHoleRadius, Direction.CW);
                path.addCircle(center.x, center.y, holeRadius, Direction.CCW);
                c.drawPath(path, transparentCirclePaint);

                // reset alpha
                transparentCirclePaint.setAlpha(alpha);
            }
        }
    }

    /**
     * Draws the description text in the center of the pie chart makes most
     * sense when center-hole is enabled.
     */
    protected drawCenterText(c: Canvas) {
        const centerText = this.mChart.getCenterText();

        if (this.mChart.isDrawCenterTextEnabled() && centerText != null) {
            const center = this.mChart.getCenterCircleBox();
            const offset = this.mChart.getCenterTextOffset();

            const x = center.x + offset.x;
            const y = center.y + offset.y;

            const innerRadius =
                this.mChart.isDrawHoleEnabled() && !this.mChart.isDrawSlicesUnderHoleEnabled() ? this.mChart.getRadius() * (this.mChart.getHoleRadius() / 100) : this.mChart.getRadius();
            const rectBuffer = this.rectBuffer;
            const holeRect = rectBuffer[0];
            holeRect.left = x - innerRadius;
            holeRect.top = y - innerRadius;
            holeRect.right = x + innerRadius;
            holeRect.bottom = y + innerRadius;
            const boundingRect = rectBuffer[1];
            boundingRect.set(holeRect);

            const radiusPercent = this.mChart.getCenterTextRadiusPercent() / 100;
            if (radiusPercent > 0.0) {
                boundingRect.inset((boundingRect.width() - boundingRect.width() * radiusPercent) / 2, (boundingRect.height() - boundingRect.height() * radiusPercent) / 2);
            }
            const centerTextLastBounds = this.centerTextLastBounds;
            if (centerText !== this.mCenterTextLastValue || boundingRect !== centerTextLastBounds) {
                // Next time we won't recalculate StaticLayout...
                centerTextLastBounds.set(boundingRect);
                this.mCenterTextLastValue = centerText;

                const width = centerTextLastBounds.width();

                // If width is 0, it will crash. Always have a minimum of 1
                this.mCenterTextLayout = new StaticLayout(centerText, this.centerTextPaint, Math.max(Math.ceil(width), 1), LayoutAlignment.ALIGN_CENTER, 1, 0, false);
            }

            //let layoutWidth = Utils.getStaticLayoutMaxWidth(mCenterTextLayout);
            const layoutHeight = this.mCenterTextLayout.getHeight();

            c.save();

            if (global.isAndroid) {
                if (android.os.Build.VERSION.SDK_INT >= 18) {
                    const path = Utils.getTempPath();
                    path.reset();
                    path.addOval(holeRect, Direction.CW);
                    c.clipPath(path);
                }
            }

            c.translate(boundingRect.left, boundingRect.top + (boundingRect.height() - layoutHeight) / 2);
            this.mCenterTextLayout.draw(c as any);

            c.restore();
        }
    }

    public drawHighlighted(c: Canvas, indices: Highlight[]) {
        /* Skip entirely if using rounded circle slices, because it doesn't make sense to highlight
         * in this way.
         * TODO: add support for changing slice color with highlighting rather than only shifting the slice
         */
        const drawInnerArc = this.mChart.isDrawHoleEnabled() && !this.mChart.isDrawSlicesUnderHoleEnabled();
        if (drawInnerArc && this.mChart.isDrawRoundedSlicesEnabled()) {
            return;
        }

        const phaseX = this.mAnimator.getPhaseX();
        const phaseY = this.mAnimator.getPhaseY();

        let angle;
        const rotationAngle = this.mChart.getRotationAngle();

        const drawAngles = this.mChart.getDrawAngles();
        const absoluteAngles = this.mChart.getAbsoluteAngles();
        const center = this.mChart.getCenterCircleBox();
        const radius = this.mChart.getRadius();
        const userInnerRadius = drawInnerArc ? radius * (this.mChart.getHoleRadius() / 100) : 0;

        const highlightedCircleBox = Utils.getTempRectF();

        const customRender = this.mChart.getCustomRenderer();
        const renderPaint = this.renderPaint;
        const pathBuffer = Utils.getTempPath();
        for (let i = 0; i < indices.length; i++) {
            // get the index to highlight
            const high = indices[i];
            const index = high.x;

            if (index >= drawAngles.length) {
                continue;
            }

            const set = this.mChart.getData().getDataSetByIndex(high.dataSetIndex);

            if (set == null || !set.isHighlightEnabled()) {
                continue;
            }

            const yKey = set.yProperty;
            const entryCount = set.getEntryCount();

            let visibleAngleCount = 0;
            for (let j = 0; j < entryCount; j++) {
                // draw only if the value is greater than zero
                if (Math.abs(set.getEntryForIndex(j)[yKey]) > Utils.NUMBER_EPSILON) {
                    visibleAngleCount++;
                }
            }

            if (index === 0) {
                angle = 0;
            } else {
                angle = absoluteAngles[index - 1] * phaseX;
            }

            const sliceSpace = visibleAngleCount <= 1 ? 0 : set.getSliceSpace();

            const sliceAngle = drawAngles[index];
            let innerRadius = userInnerRadius;

            const shift = set.getSelectionShift();
            const highlightedRadius = radius + shift;
            highlightedCircleBox.set(this.mChart.getCircleBox());
            highlightedCircleBox.inset(-shift, -shift);

            const accountForSliceSpacing = sliceSpace > 0 && sliceAngle <= 180;

            renderPaint.setColor(set.getColor(index));

            const sliceSpaceAngleOuter = visibleAngleCount === 1 ? 0 : sliceSpace / (Utils.DEG2RAD * radius);
            const sliceSpaceAngleShifted = visibleAngleCount === 1 ? 0 : sliceSpace / (Utils.DEG2RAD * highlightedRadius);

            const startAngleOuter = rotationAngle + (angle + sliceSpaceAngleOuter / 2) * phaseY;
            let sweepAngleOuter = (sliceAngle - sliceSpaceAngleOuter) * phaseY;
            if (sweepAngleOuter < 0) {
                sweepAngleOuter = 0;
            }

            const startAngleShifted = rotationAngle + (angle + sliceSpaceAngleShifted / 2) * phaseY;
            let sweepAngleShifted = (sliceAngle - sliceSpaceAngleShifted) * phaseY;
            if (sweepAngleShifted < 0) {
                sweepAngleShifted = 0;
            }

            pathBuffer.reset();

            if (sweepAngleOuter >= 360 && sweepAngleOuter % 360 <= Utils.NUMBER_EPSILON) {
                // Android is doing "mod 360"
                pathBuffer.addCircle(center.x, center.y, highlightedRadius, Direction.CW);
            } else {
                pathBuffer.moveTo(center.x + highlightedRadius * Math.cos(startAngleShifted * Utils.DEG2RAD), center.y + highlightedRadius * Math.sin(startAngleShifted * Utils.DEG2RAD));

                pathBuffer.arcTo(highlightedCircleBox, startAngleShifted, sweepAngleShifted);
            }

            let sliceSpaceRadius = 0;
            if (accountForSliceSpacing) {
                sliceSpaceRadius = this.calculateMinimumRadiusForSpacedSlice(
                    center,
                    radius,
                    sliceAngle * phaseY,
                    center.x + radius * Math.cos(startAngleOuter * Utils.DEG2RAD),
                    center.y + radius * Math.sin(startAngleOuter * Utils.DEG2RAD),
                    startAngleOuter,
                    sweepAngleOuter
                );
            }


            if (drawInnerArc && (innerRadius > 0 || accountForSliceSpacing)) {
                // Android API < 21 does not receive floats in addArc, but a RectF
                const innerRectBuffer = Utils.getTempRectF()
                innerRectBuffer.set(center.x - innerRadius, center.y - innerRadius, center.x + innerRadius, center.y + innerRadius);
                if (accountForSliceSpacing) {
                    let minSpacedRadius = sliceSpaceRadius;

                    if (minSpacedRadius < 0) minSpacedRadius = -minSpacedRadius;

                    innerRadius = Math.max(innerRadius, minSpacedRadius);
                }

                const sliceSpaceAngleInner = visibleAngleCount === 1 || innerRadius === 0 ? 0 : sliceSpace / (Utils.DEG2RAD * innerRadius);
                const startAngleInner = rotationAngle + (angle + sliceSpaceAngleInner / 2) * phaseY;
                let sweepAngleInner = (sliceAngle - sliceSpaceAngleInner) * phaseY;
                if (sweepAngleInner < 0) {
                    sweepAngleInner = 0;
                }
                const endAngleInner = startAngleInner + sweepAngleInner;

                if (sweepAngleOuter >= 360 && sweepAngleOuter % 360 <= Utils.NUMBER_EPSILON) {
                    // Android is doing "mod 360"
                    pathBuffer.addCircle(center.x, center.y, innerRadius, Direction.CCW);
                } else {
                    pathBuffer.lineTo(center.x + innerRadius * Math.cos(endAngleInner * Utils.DEG2RAD), center.y + innerRadius * Math.sin(endAngleInner * Utils.DEG2RAD));
                    pathBuffer.arcTo(innerRectBuffer, endAngleInner, -sweepAngleInner);
                }
            } else {
                if (sweepAngleOuter % 360 > Utils.NUMBER_EPSILON) {
                    if (accountForSliceSpacing) {
                        const angleMiddle = startAngleOuter + sweepAngleOuter / 2;

                        const arcEndPointX = center.x + sliceSpaceRadius * Math.cos(angleMiddle * Utils.DEG2RAD);
                        const arcEndPointY = center.y + sliceSpaceRadius * Math.sin(angleMiddle * Utils.DEG2RAD);

                        pathBuffer.lineTo(arcEndPointX, arcEndPointY);
                    } else {
                        pathBuffer.lineTo(center.x, center.y);
                    }
                }
            }

            pathBuffer.close();
            if (customRender && customRender.drawHighlight) {
                customRender.drawHighlight(c, high, pathBuffer, renderPaint);
            } else {
                c.drawPath(pathBuffer, renderPaint);
            }
        }
    }

    /**
     * This gives all pie-slices a rounded edge.
     *
     * @param c
     */
    protected drawRoundedSlices(c: Canvas) {
        if (!this.mChart.isDrawRoundedSlicesEnabled()) {
            return;
        }

        const dataSet = this.mChart.getData().getDataSet();

        if (!dataSet.isVisible()) {
            return;
        }

        const yKey = dataSet.yProperty;
        const phaseX = this.mAnimator.getPhaseX();
        const phaseY = this.mAnimator.getPhaseY();

        const center = this.mChart.getCenterCircleBox();
        const r = this.mChart.getRadius();

        // calculate the radius of the "slice-circle"
        const circleRadius = (r - (r * this.mChart.getHoleRadius()) / 100) / 2;

        const drawAngles = this.mChart.getDrawAngles();
        let angle = this.mChart.getRotationAngle();

        const renderPaint = this.renderPaint;
        for (let j = 0; j < dataSet.getEntryCount(); j++) {
            const sliceAngle = drawAngles[j];

            const e = dataSet.getEntryForIndex(j);

            // draw only if the value is greater than zero
            if (Math.abs(e[yKey]) > Utils.NUMBER_EPSILON) {
                const x = (r - circleRadius) * Math.cos((angle + sliceAngle) * phaseY * Utils.DEG2RAD) + center.x;
                const y = (r - circleRadius) * Math.sin((angle + sliceAngle) * phaseY * Utils.DEG2RAD) + center.y;

                renderPaint.setColor(dataSet.getColor(j));
                c.drawCircle(x, y, circleRadius, renderPaint);
            }

            angle += sliceAngle * phaseX;
        }
    }

    /**
     * Releases the drawing bitmap.
     */
    public releaseBitmap() {
        if (this.mBitmapCanvas != null) {
            this.mBitmapCanvas.setBitmap(null);
            this.mBitmapCanvas = null;
        }
        if (this.mDrawBitmap != null) {
            const drawBitmap = this.mDrawBitmap.get();
            if (drawBitmap != null) {
                releaseImage(drawBitmap);
            }
            this.mDrawBitmap.clear();
            this.mDrawBitmap = null;
        }
    }
}
