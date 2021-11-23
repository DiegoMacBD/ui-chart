import { DashPathEffect } from '@nativescript-community/ui-canvas';
import { ObservableArray, profile } from '@nativescript/core';
import { Color } from '@nativescript/core/color';
import { createLTTB } from 'downsample/methods/LTTB';
import { DefaultFillFormatter } from '../formatter/DefaultFillFormatter';
import { IFillFormatter } from '../formatter/IFillFormatter';
import { ILineDataSet } from '../interfaces/datasets/ILineDataSet';
import { ColorTemplate } from '../utils/ColorTemplate';
import { Entry } from './Entry';
import { LineRadarDataSet } from './LineRadarDataSet';

export enum Mode {
    LINEAR,
    STEPPED,
    CUBIC_BEZIER,
    HORIZONTAL_BEZIER
}

export class LineDataSet extends LineRadarDataSet<Entry> implements ILineDataSet {
    /**
     * Drawing mode for this line dataset
     **/
    private mMode = Mode.LINEAR;

    /**
     * List representing all colors that are used for the circles
     */
    private mCircleColors: string[] | Color[] = [];

    /**
     * the color of the inner circles
     */
    private mCircleHoleColor = ColorTemplate.COLOR_NONE;

    /**
     * the radius of the circle-shaped value indicators
     */
    private mCircleRadius = 4;

    /**
     * the hole radius of the circle-shaped value indicators
     */
    private mCircleHoleRadius = 2;

    /**
     * sets the intensity of the cubic lines
     */
    private mCubicIntensity = 0.2;

    /**
     * the path effect of this DataSet that makes dashed lines possible
     */
    private mDashPathEffect = null;

    /**
     * formatter for customizing the position of the fill-line
     */
    private mFillFormatter: IFillFormatter = new DefaultFillFormatter();

    /**
     * if true, drawing circles is enabled
     */
    private mDrawCircles = false;

    private mDrawCircleHole = true;

    private mUseColorsForFill = false;

    public useColorsForLine = false;

    /**
     * the max number allowed point before filtering. <= O means disabled
     */
    private mMaxFilterNumber = 0;

    constructor(yVals, label, xProperty?, yProperty?) {
        super(yVals, label, xProperty, yProperty);
        this.init();
    }

    public getMaxFilterNumber() {
        return this.mMaxFilterNumber;
    }

    /**
     * Sets the max number allowed point before filtering.
     *
     * @param value: number
     */
    public setMaxFilterNumber(value: number) {
        this.mMaxFilterNumber = value;
    }

    protected mFilteredValues: Entry[] = null;
    protected mFilterFunction;
    @profile
    public applyFiltering(scaleX: number) {
        if (this.mMaxFilterNumber > 0 && this.mValues.length / scaleX > this.mMaxFilterNumber) {
            const filterCount = Math.round(this.mMaxFilterNumber * scaleX);
            if (!this.mFilteredValues || this.mFilteredValues.length !== filterCount) {
                if (!this.mFilterFunction) {
                    this.mFilterFunction = createLTTB({
                        x: this.xProperty,
                        y: this.yProperty
                    } as any);
                }
                this.mFilteredValues = this.mFilterFunction(this.mValues, filterCount);
            }
        } else if (this.mFilteredValues) {
            this.mFilteredValues = null;
        }
        this.updateGetEntryForIndex();
    }

    mIgnoreFiltered = false;
    protected getInternalValues() {
        if (this.mFilteredValues && !this.mIgnoreFiltered) {
            return this.mFilteredValues;
        }
        return this.mValues;
    }
    setIgnoreFiltered(value) {
        this.mIgnoreFiltered = value;
        this.updateGetEntryForIndex();
    }
    setValues(values) {
        this.mFilteredValues = null;
        super.setValues(values);
    }
    isFiltered() {
        return !!this.mFilteredValues;
    }

    /**
     * Returns the drawing mode for this line dataset
     *
     * @return
     */

    public getMode() {
        return this.mMode;
    }

    /**
     * Returns the drawing mode for this LineDataSet
     *
     * @return
     */
    public setMode(mode: Mode) {
        this.mMode = mode;
    }

    /**
     * Sets the intensity for cubic lines (if enabled). Max = 1 = very cubic,
     * Min = 0.05f = low cubic effect, Default: 0.2f
     *
     * @param intensity
     */
    public setCubicIntensity(intensity) {
        if (intensity > 1) intensity = 1;
        if (intensity < 0.05) intensity = 0.05;

        this.mCubicIntensity = intensity;
    }

    public getCubicIntensity() {
        return this.mCubicIntensity;
    }

    /**
     * Sets the radius of the drawn circles.
     * Default radius = 4f, Min = 1
     *
     * @param radius
     */
    public setCircleRadius(radius) {
        if (radius >= 1) {
            this.mCircleRadius = radius;
        } else {
            console.error('LineDataSet', 'Circle radius cannot be < 1');
        }
    }

    public getCircleRadius() {
        return this.mCircleRadius;
    }

    /**
     * Property definining wheter circles are drawn in high res.
     * Default true
     */
    circleHighRes = true;

    /**
     * Sets the hole radius of the drawn circles.
     * Default radius = 2f, Min = 0.5f
     *
     * @param holeRadius
     */
    public setCircleHoleRadius(holeRadius) {
        if (holeRadius >= 0.5) {
            this.mCircleHoleRadius = holeRadius;
        } else {
            console.error('LineDataSet', 'Circle radius cannot be < 0.5');
        }
    }

    public getCircleHoleRadius() {
        return this.mCircleHoleRadius;
    }

    /**
     * sets the size (radius) of the circle shpaed value indicators,
     * default size = 4f
     * <p/>
     * This method is deprecated because of unclarity. Use setCircleRadius instead.
     *
     * @param size
     */

    public setCircleSize(size) {
        this.setCircleRadius(size);
    }

    /**
     * This function is deprecated because of unclarity. Use getCircleRadius instead.
     */

    public getCircleSize() {
        return this.getCircleRadius();
    }

    /**
     * Enables the line to be drawn in dashed mode, e.g. like this
     * "- - - - - -". THIS ONLY WORKS IF HARDWARE-ACCELERATION IS TURNED OFF.
     * Keep in mind that hardware acceleration boosts performance.
     *
     * @param lineLength  the length of the line pieces
     * @param spaceLength the length of space in between the pieces
     * @param phase       offset, in degrees (normally, use 0)
     */
    public enableDashedLine(lineLength, spaceLength, phase) {
        this.mDashPathEffect = new DashPathEffect([lineLength, spaceLength], phase);
        // this.mDashPathEffect = parseDashEffect(`${lineLength} ${spaceLength} ${phase}`) ;
    }

    /**
     * Disables the line to be drawn in dashed mode.
     */
    public disableDashedLine() {
        this.mDashPathEffect = null;
    }

    public isDashedLineEnabled() {
        return this.mDashPathEffect == null ? false : true;
    }

    public getDashPathEffect() {
        return this.mDashPathEffect;
    }

    /**
     * set this to true to enable the drawing of circle indicators for this
     * DataSet, default true
     *
     * @param enabled
     */
    public setDrawCircles(enabled) {
        this.mDrawCircles = enabled;
    }

    public isDrawCirclesEnabled() {
        return this.mDrawCircles;
    }

    public isDrawCubicEnabled() {
        return this.mMode === Mode.CUBIC_BEZIER;
    }

    public isDrawSteppedEnabled() {
        return this.mMode === Mode.STEPPED;
    }

    /** ALL CODE BELOW RELATED TO CIRCLE-COLORS */

    /**
     * returns all colors specified for the circles
     *
     * @return
     */
    public getCircleColors() {
        return this.mCircleColors;
    }

    public getCircleColor(index) {
        return this.mCircleColors[Math.floor(index)] || this.getColor();
    }

    public getCircleColorCount() {
        return this.mCircleColors.length || 1;
    }

    /**
     * Sets the colors that should be used for the circles of this DataSet.
     * Colors are reused as soon as the number of Entries the DataSet represents
     * is higher than the size of the colors array. Make sure that the colors
     * are already prepared (by calling getResources().getColor(...)) before
     * adding them to the DataSet.
     *
     * @param colors
     */
    public setCircleColors(colors: string[] | Color[]) {
        this.mCircleColors = colors;
    }

    /**
     * Sets the one and ONLY color that should be used for this DataSet.
     * Internally, this recreates the colors array and adds the specified color.
     *
     * @param color
     */
    public setCircleColor(color) {
        this.resetCircleColors();
        this.mCircleColors.push(color);
    }

    /**
     * resets the circle-colors array and creates a new one
     */
    public resetCircleColors() {
        // if (this.mCircleColors == null) {
        this.mCircleColors = [];
        // }
        // this.mCircleColors.clear();
    }

    /**
     * Sets the color of the inner circle of the line-circles.
     *
     * @param color
     */
    public setCircleHoleColor(color) {
        this.mCircleHoleColor = color;
    }

    public getCircleHoleColor() {
        return this.mCircleHoleColor;
    }

    /**
     * Set this to true to allow drawing a hole in each data circle.
     *
     * @param enabled
     */
    public setDrawCircleHole(enabled) {
        this.mDrawCircleHole = enabled;
    }

    public isDrawCircleHoleEnabled() {
        return this.mDrawCircleHole;
    }

    /**
     * Sets a custom IFillFormatter to the chart that handles the position of the
     * filled-line for each DataSet. Set this to null to use the default logic.
     *
     * @param formatter
     */
    public setFillFormatter(formatter) {
        if (formatter == null) this.mFillFormatter = new DefaultFillFormatter();
        else this.mFillFormatter = formatter;
    }

    public getFillFormatter() {
        return this.mFillFormatter;
    }

    getUseColorsForFill() {
        return this.mUseColorsForFill;
    }

    setUseColorsForFill(value: boolean) {
        this.mUseColorsForFill = value;
    }
}
