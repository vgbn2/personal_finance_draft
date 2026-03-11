/*
 * Filename: C01014.c
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
    float a, b;
    scanf("%f %f", &a, &b); // Read input
    if (a == 0)
    {
        if (b == 0)
            printf("Vo so nghiem"); // Print result
        else
            printf("Vo nghiem"); // Print result
    }
    else
        printf("%.2f", -b / a); // Print result
    return 0;
}