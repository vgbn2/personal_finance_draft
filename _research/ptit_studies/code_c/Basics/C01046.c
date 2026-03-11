/*
 * Filename: C01046.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <math.h>

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
    {
        float a, b, c, d;
        scanf("%f %f %f %f", &a, &b, &c, &d); // Read input
        float x = sqrt((a - c) * (a - c) + (b - d) * (b - d));
        printf("%.4f\n", x); // Print result
    }
    return 0;
}