/*
 * Filename: C04035.c
 * Description: Calculates sums using functions: min, max
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

int min(int a, int b)
{
    if (a < b)
        return a;
    return b;
}

int max(int a, int b)
{
    if (a > b)
        return a;
    return b;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int minU = 50000, minD = 50000;
    int sumU = 0, sumD = 0;
    for (int i = 1; i <= n; i++)
    {
        int a, b;
        scanf("%d %d", &a, &b); // Read input
        sumU += a;
        sumD += b;
        minU = min(minU, a);
        minD = min(minD, b);
    }
    sumU += minD;
    sumD += minU;
    printf("%d", max(sumU, sumD)); // Print result
    return 0;
}