/*
 * Filename: C01040.c
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
#include <math.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int sum = 1;
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
        {
            sum += i;
            sum += n / i;
            if (i * i == n)
                sum -= i;
        }
    if (sum == n)
        printf("1"); // Print result
    else
        printf("0"); // Print result
    return 0;
}