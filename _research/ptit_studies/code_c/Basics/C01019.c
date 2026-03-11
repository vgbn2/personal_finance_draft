/*
 * Filename: C01019.c
 * Description: Calculates sums
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
    int n;
    scanf("%d", &n); // Read input
    double sum = 1;
    for (int i = 2; i <= n; i++)
        sum += (double)1 / i;
    printf("%.4lf", sum); // Print result
    return 0;
}