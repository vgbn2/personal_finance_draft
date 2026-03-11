/*
 * Filename: C01043.c
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

int giaithua(int n)
{
    int res = 1;
    for (int i = 1; i <= n; i++)
        res *= i;
    return res;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int sum = 0;
    int a = n;
    while (a > 0)
    {
        sum += giaithua(a % 10);
        a /= 10;
    }
    if (sum == n)
        printf("1"); // Print result
    else
        printf("0"); // Print result
    return 0;
}