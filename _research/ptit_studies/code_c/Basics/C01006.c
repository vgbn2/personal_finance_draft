/*
 * Filename: C01006.c
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
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    if (b == 0)
    {
        printf("0"); // Print result
        return 0;
    }
    printf("%d %d %d %.2f %d", a + b, a - b, a * b, (float)a / b, a % b); // Print result
    return 0;
}