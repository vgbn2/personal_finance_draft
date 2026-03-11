/*
 * Filename: C03010.c
 * Description: Calculates sums using functions: giaithua
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
#include <stdbool.h>

int giaithua(int n)
{
    int res = 1;
    for (int i = 1; i <= n; i++)
        res *= i;
    return res;
}

bool check(int n)
{
    int sum = 0, a = n;
    while (a > 0)
    {
        sum += giaithua(a % 10);
        a /= 10;
    }
    if (sum == n)
        return 1;
    else
        return 0;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    for (int i = 1; i <= n; i++)
        if (check(i))
            printf("%d ", i); // Print result
    return 0;
}