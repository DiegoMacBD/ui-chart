import { Color } from '@nativescript/core/color';

/**
 * Class that holds predefined color integer arrays (e.g.
 * ColorTemplate.VORDIPLOM_COLORS) and convenience methods for loading colors
 * from resources.
 *

 */
export class ColorTemplate {
    /**
     * an "invalid" color that indicates that no color is set
     */
    public static COLOR_NONE = new Color(-1);

    /**
     * this "color" is used for the Legend creation and indicates that the next
     * form should be skipped
     */
    public static COLOR_SKIP = new Color(0x00112234);
    /**
     * Returns the Android ICS holo blue light color.
     *
     * @return
     */
    public static getHoloBlue() {
        return 'rgb(51, 181, 229)';
    }

    public static getColorInstance(c: Color | number | string) {
        return c instanceof Color ? c : new Color(c as any);
    }

    /**
     * Sets the alpha component of the given color.
     *
     * @param color
     * @param alpha 0 - 255
     * @return
     */
    public static colorWithAlpha(color: Color, alpha) {
        return new Color(alpha, color.r, color.g, color.b);
    }
}
