/*
 * Filename: C01020.c
 * Description: Calculates sums using functions: gt
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

long long gt(int n)
{
    long long res = 1;
    for (int i = 2; i <= n; i++)
        res *= i;
    return res;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    long long sum = 0;
    for (int i = 1; i <= n; i++)
    {
        sum += gt(i);
    }
    printf("%lld", sum); // Print result
    return 0;
}