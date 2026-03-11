/*
 * Filename: C03008.c
 * Description: C Program using functions: solve
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

int solve(int n)
{
    int res = 1;
    for (int i = 2; i <= sqrt(n); i++)
    {
        if (n % i == 0)
            res = res + i + n / i;
        if (i * i == n)
            res = res - i;
    }
    return res;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    for (int i = 2; i <= n; i++)
    {
        if (solve(i) == i)
            printf("%d ", i); // Print result
    }
    return 0;
}