/*
 * Filename: C01015.c
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
    float a, b, c;
    scanf("%f %f %f", &a, &b, &c); // Read input
    if (a == 0)
    {
        if (b == 0)
            printf("NO"); // Print result
        else
            printf("%.2f", (float)-c / b); // Print result
    }
    else
    {
        float denta = b * b - 4 * a * c;
        if (denta < 0)
            printf("NO"); // Print result
        else if (denta == 0)
            printf("%.2f", (float)-b / (2 * a)); // Print result
        else
        {
            float x1 = (-b + sqrt(denta)) / (2 * a);
            float x2 = (-b - sqrt(denta)) / (2 * a);
            printf("%.2f %.2f", x1, x2); // Print result
        }
    }
    return 0;
}