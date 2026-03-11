/*
 * Filename: C01010.c
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

// Entry point
int main()
{
    int d, w = 0, y = 0;
    scanf("%d", &d); // Read input
    if (d >= 365)
    {
        y = d / 365;
        d = d % 365;
    }
    if (d >= 7)
    {
        w = d / 7;
        d = d % 7;
    }
    printf("%d %d %d", y, w, d); // Print result
    return 0;
}