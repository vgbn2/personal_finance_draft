/*
 * Filename: LAB01-0007.c
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
    int a[n];
    double sum = 0;
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        sum += a[i];
    }
    printf("%.3lf", (double)sum / n); // Print result
    return 0;
}